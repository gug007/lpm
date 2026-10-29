package cx.lpm.mobile.core.data.usage

import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.clearLimitReminder
import cx.lpm.mobile.core.data.client.requestClaudeAccounts
import cx.lpm.mobile.core.data.client.requestLimitReminders
import cx.lpm.mobile.core.data.client.requestLimits
import cx.lpm.mobile.core.data.client.requestStats
import cx.lpm.mobile.core.data.client.setLimitReminder
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.LimitReminder
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.LimitsSnapshot
import cx.lpm.mobile.core.model.USAGE_GENERIC_ERROR
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class UsageState(
    val snapshot: LimitsSnapshot? = null,
    val loading: Boolean = false,
    val error: String? = null,
    /**
     * Today's spend per tool, for the usage rows' fallback when a tool has no window
     * yet — the desktop sidebar's `useTokensToday`.
     */
    val today: AgentStats? = null,
    /**
     * Millis to ADD to this phone's clock to land on the Mac's. Only the Mac-stamped
     * `updatedAt` belongs on that clock; a window's `resetsAt` is stamped by the tool's
     * own servers and stays on the phone's. Zero when the Mac didn't say what time it was.
     */
    val clockOffsetMs: Double = 0.0,
    /** The Mac's limit reminders, kept in step as the desktop or any phone changes them. */
    val reminders: List<LimitReminder> = emptyList(),
    val remindersSupported: Boolean = false
) {
    fun reminderSet(limit: String, window: String): Boolean =
        reminders.any { it.limit == limit && it.window == window }

    /**
     * A moment on this phone read as the Mac would have read it, unix millis — for
     * comparing against `updatedAt`, and nothing else.
     */
    fun macMillis(phoneMillis: Long): Double = phoneMillis + clockOffsetMs
}

/**
 * The agent plan-usage meters (iOS `UsageStore`, the desktop Usage page): how much of
 * each tool's 5-hour and weekly window is spent. The Mac answers `limits` inline and
 * pushes the whole snapshot again whenever a tool reports new numbers, so a push
 * replaces the held snapshot outright rather than triggering another request.
 */
class UsageStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(UsageState())
    val state: StateFlow<UsageState> = mutable.asStateFlow()

    // True while the Usage screen is showing, so a reconnect replays the request
    // instead of leaving the screen on stale numbers.
    private var active = false
    private val timeout = GenerationTimeout<String>(session.scope)

    // How many lists with usage rows are on screen; while any is, a usage push also
    // refreshes today's spend and the account pools.
    private var rowViewers = 0
    private var extrasAskedAt: Long? = null

    private val accounts: ClaudeAccountsStore get() = session.store()

    override fun wire(client: LpmClient) {
        client.onLimits = { snapshot, error -> apply(snapshot, error) }
        client.onLimitsChanged = ::applyPush
        client.onLimitReminders = { reminders, error -> applyReminders(reminders, error) }
    }

    private val remindersSupported: Boolean
        get() = session.client?.hostFeatures?.contains(LpmClient.LIMIT_REMINDERS_FEATURE) == true

    override fun reset() {
        timeout.cancelAll()
        active = false
        rowViewers = 0
        extrasAskedAt = null
        mutable.value = UsageState()
    }

    /**
     * The socket was replaced: nothing in flight can still answer, so drop the spinner
     * and re-issue if the screen is still open.
     */
    override fun onConnectionReset() {
        timeout.cancelAll()
        mutable.update { it.copy(loading = false) }
        if (active) {
            load()
            if (remindersSupported) session.client?.requestLimitReminders()
        }
    }

    // MARK: usage rows (projects list, project screen)

    /**
     * A list showing usage rows appeared, or the link came back under it: read the
     * meters, today's spend and the accounts the rows are named and tagged by.
     */
    fun rowsDidAppear() {
        rowViewers += 1
        session.client?.requestLimits()
        refreshExtras()
    }

    fun rowsDidDisappear() {
        rowViewers = maxOf(0, rowViewers - 1)
    }

    /**
     * Today's spend changes as agents work, and the pools move as switching picks
     * another account, but neither is pushed. Scanning today's history and reading
     * every account's login are cheap but not free, so they run at most every
     * [EXTRAS_INTERVAL_MS] — sooner only when the accounts were never read.
     */
    fun refreshExtras() {
        val now = session.env.clock.millis()
        val due = extrasAskedAt?.let { now - it >= EXTRAS_INTERVAL_MS } ?: true
        if (due) {
            extrasAskedAt = now
            session.client?.requestStats(days = 1)
        }
        if (due || accounts.state.value.accounts == null) {
            session.client?.requestClaudeAccounts()
        }
    }

    fun applyToday(stats: AgentStats) = mutable.update { it.copy(today = stats) }

    // MARK: screen lifecycle

    /**
     * The cards are titled by the names accounts were given on the Mac, so the
     * accounts are read too when nothing else has read them yet.
     */
    fun screenDidOpen() {
        load()
        if (remindersSupported) session.client?.requestLimitReminders()
        if (accounts.state.value.accounts == null) session.client?.requestClaudeAccounts()
    }

    fun screenDidClose() {
        active = false
    }

    /** Pull-to-refresh: re-request when live, else nudge the link back up. */
    suspend fun refresh() {
        if (session.state.value.isReady) load() else session.reconnectIfNeeded()
        delay(REFRESH_SETTLE_MS)
    }

    fun load() {
        active = true
        mutable.update { it.copy(loading = true, error = null) }
        session.client?.requestLimits()
        // A Mac too old to know this request never answers at all, and a reply can
        // also be lost while the socket stays up — give up rather than spin. A reload
        // keeps the numbers already on screen, but it still has to say so: silently
        // leaving hours-old percentages up reads as current.
        timeout.arm(LIMITS, LIMITS_TIMEOUT_MS) {
            if (state.value.loading) {
                mutable.update { it.copy(loading = false, error = USAGE_GENERIC_ERROR) }
            }
        }
    }

    // MARK: replies

    fun apply(snapshot: LimitsSnapshot?, error: String?) {
        timeout.cancel(LIMITS)
        mutable.update { it.copy(loading = false) }
        if (snapshot != null) {
            adopt(snapshot)
        } else {
            mutable.update { it.copy(error = error ?: USAGE_GENERIC_ERROR) }
        }
    }

    /**
     * A tool reported new numbers. Fresh data settles whatever a request was waiting
     * for, even when the reply itself never arrives — so it has to clear the spinner
     * and any earlier failure as well as the timeout, or the screen stays dimmed over
     * numbers that are in fact current.
     */
    fun applyPush(snapshot: LimitsSnapshot) {
        timeout.cancel(LIMITS)
        mutable.update { it.copy(loading = false) }
        adopt(snapshot)
        // A push means an agent just reported work — the closest thing to a "spend
        // changed" signal there is.
        if (rowViewers > 0) refreshExtras()
    }

    private fun adopt(snapshot: LimitsSnapshot) {
        val offset = snapshot.nowMs?.let { it - session.env.clock.millis() } ?: 0.0
        mutable.update {
            it.copy(
                snapshot = snapshot,
                error = null,
                clockOffsetMs = offset,
                remindersSupported = remindersSupported
            )
        }
    }

    // MARK: limit reminders

    /** Sets or clears the reminder for one window of the card whose limits are `limit`. */
    fun toggleReminder(limit: String, window: String, win: LimitWindow, name: String) {
        if (state.value.reminderSet(limit, window)) {
            mutable.update { s ->
                s.copy(
                    reminders = s.reminders.filterNot {
                        it.limit == limit && it.window == window
                    }
                )
            }
            session.client?.clearLimitReminder(limit, window)
        } else {
            val added = LimitReminder(limit, window, win.resetsAt, name)
            mutable.update { it.copy(reminders = it.reminders + added) }
            session.client?.setLimitReminder(limit, window, win.resetsAt, name)
        }
    }

    fun applyReminders(reminders: List<LimitReminder>, error: String?) {
        mutable.update { it.copy(reminders = reminders, remindersSupported = remindersSupported) }
        error?.let(session.alerts::showError)
    }

    private companion object {
        const val LIMITS = "limits"
        const val LIMITS_TIMEOUT_MS = 20_000L
        const val EXTRAS_INTERVAL_MS = 30_000L
        const val REFRESH_SETTLE_MS = 500L
    }
}
