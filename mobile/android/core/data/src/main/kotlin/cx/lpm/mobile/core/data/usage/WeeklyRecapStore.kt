package cx.lpm.mobile.core.data.usage

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestWeeklyRecap
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapPick
import cx.lpm.mobile.core.model.RecapWeek
import cx.lpm.mobile.core.model.WeeklyRecap
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

private val LastWeek = RecapPick(RecapWeek.Last, RecapPeriod.Week)

data class WeeklyRecapState(
    /** The week or month on screen. */
    val pick: RecapPick = LastWeek,
    /** Each week's and month's last answer, kept while another one shows. */
    val recaps: Map<RecapPick, WeeklyRecap> = emptyMap(),
    val loading: Set<RecapPick> = emptySet(),
    /** Why a week or month without an answer couldn't be read. */
    val errors: Map<RecapPick, String> = emptyMap()
)

/**
 * The desktop's weekly recap ("My agents' week", or month), last week or this week so
 * far, or a month. The Mac reads it off its socket, so replies arrive seconds later and
 * name their week or month.
 */
class WeeklyRecapStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(WeeklyRecapState())
    val state: StateFlow<WeeklyRecapState> = mutable.asStateFlow()

    // Asks again after a reconnect while the screen is open.
    private var active = false

    private val timeout = GenerationTimeout<RecapPick>(session.scope)

    /** The Mac answers `weeklyRecap`. */
    val available: Boolean
        get() = session.client?.hostFeatures?.contains(LpmClient.WEEKLY_RECAP_FEATURE) == true

    /** The Mac answers `weeklyRecap` for a month. */
    val monthAvailable: Boolean
        get() = session.client?.hostFeatures?.contains(LpmClient.RECAP_MONTH_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onWeeklyRecap = ::receive
    }

    override fun reset() {
        timeout.cancelAll()
        active = false
        mutable.value = WeeklyRecapState()
    }

    /** The socket was replaced: nothing in flight can answer, so an open screen asks again. */
    override fun onConnectionReset() {
        timeout.cancelAll()
        val waiting = state.value.loading
        mutable.update { it.copy(loading = emptySet()) }
        if (active) waiting.forEach { load(it) }
    }

    /** The screen opens on last week, the one that's over. */
    fun screenDidOpen() {
        active = true
        select(LastWeek)
    }

    fun select(pick: RecapPick) {
        mutable.update { it.copy(pick = pick) }
        load(pick)
    }

    /**
     * Ask for [pick]; [fresh] reads it again instead of the Mac's read from the last ten
     * minutes. A week or month already on screen stays there while it reloads.
     */
    fun load(pick: RecapPick = state.value.pick, fresh: Boolean = false) {
        mutable.update { it.copy(loading = it.loading + pick, errors = it.errors - pick) }
        session.client?.requestWeeklyRecap(pick.week.wire, pick.period.wire, fresh)
        timeout.arm(pick, TIMEOUT_MS) {
            if (pick !in state.value.loading) return@arm
            mutable.update {
                it.copy(
                    loading = it.loading - pick,
                    errors = if (pick in
                        it.recaps
                    ) {
                        it.errors
                    } else {
                        it.errors + (pick to TIMEOUT_ERROR)
                    }
                )
            }
        }
    }

    /** Pull to refresh: read the week or month again when live, else reconnect. */
    suspend fun refresh() {
        if (session.state.value.isReady) {
            load(state.value.pick, fresh = true)
        } else {
            session.reconnectIfNeeded()
        }
        delay(REFRESH_SETTLE_MS)
    }

    fun screenDidClose() {
        active = false
    }

    private fun receive(week: String, period: String, recap: WeeklyRecap?, error: String?) {
        val which = RecapPick(
            RecapWeek.of(week) ?: RecapWeek.Last,
            RecapPeriod.of(period) ?: RecapPeriod.Week
        )
        timeout.cancel(which)
        mutable.update {
            if (recap != null) {
                it.copy(
                    recaps = it.recaps + (which to recap),
                    loading = it.loading - which,
                    errors = it.errors - which
                )
            } else {
                it.copy(
                    loading = it.loading - which,
                    errors =
                        it.errors + (which to (error ?: "Couldn't read the ${which.period.wire}."))
                )
            }
        }
    }

    private companion object {
        const val TIMEOUT_MS = 30_000L
        const val REFRESH_SETTLE_MS = 500L
        const val TIMEOUT_ERROR = "The Mac didn't answer."
    }
}
