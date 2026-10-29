package cx.lpm.mobile.feature.usage.usage

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.usage.UsageState
import cx.lpm.mobile.core.data.usage.UsageStore
import cx.lpm.mobile.core.model.ClaudeAccounts
import cx.lpm.mobile.core.model.LimitReminder
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.ProviderLimits
import cx.lpm.mobile.core.model.UsageCard
import cx.lpm.mobile.core.model.claudeCards
import cx.lpm.mobile.core.model.codexEntry
import cx.lpm.mobile.core.navigation.UsageKey
import cx.lpm.mobile.feature.usage.ui.clockTicks
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** What the Usage screen shows. */
sealed interface UsageBody {
    data object Loading : UsageBody

    data class Failed(val message: String) : UsageBody

    data class Loaded(
        /** One card per Claude account that reported, empty while Claude reporting is off. */
        val claude: List<UsageCard>,
        val claudeEnabled: Boolean,
        val codex: ProviderLimits?,
        /** A refresh failed with these cards still on screen. */
        val refreshError: String?,
        /** A reload in flight dims the cards rather than blanking them. */
        val dimmed: Boolean
    ) : UsageBody
}

data class UsageUiState(
    val body: UsageBody = UsageBody.Loading,
    /** The Mac's limit reminders; empty from a Mac that keeps none. */
    val reminders: List<LimitReminder> = emptyList(),
    val remindersSupported: Boolean = false,
    /** Unix millis on the phone's clock, for the windows the tools stamped. */
    val now: Double = 0.0,
    /** The same moment on the Mac's clock, for the `updatedAt` it stamped. */
    val macNow: Double = 0.0
)

/**
 * The Usage screen (iOS `UsageScreen`): how much of each AI coding tool's 5-hour and
 * weekly window is spent. Reset countdowns move without new data arriving, so the
 * state follows a 30-second clock.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = UsageViewModel.Factory::class)
class UsageViewModel @AssistedInject constructor(
    @Assisted val key: UsageKey,
    private val sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    private val usage: UsageStore? get() = sessions[key.session]?.store()

    val uiState: StateFlow<UsageUiState> = sessions.session(key.session)
        .flatMapLatest { s -> s?.let(::screenState) ?: flowOf(UsageUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UsageUiState())

    private fun screenState(s: MacSession): Flow<UsageUiState> = combine(
        s.store<UsageStore>().state,
        s.store<ClaudeAccountsStore>().state,
        clockTicks(clock)
    ) { usage, accounts, now -> uiState(usage, accounts.accounts, now) }

    private fun uiState(s: UsageState, accounts: ClaudeAccounts?, now: Long): UsageUiState {
        val snapshot = s.snapshot
        val error = s.error
        val body = when {
            snapshot != null -> UsageBody.Loaded(
                claude = if (snapshot.claudeEnabled) {
                    claudeCards(snapshot, accounts?.accounts.orEmpty())
                } else {
                    emptyList()
                },
                claudeEnabled = snapshot.claudeEnabled,
                codex = codexEntry(snapshot),
                refreshError = error,
                dimmed = s.loading
            )

            s.loading -> UsageBody.Loading

            error != null -> UsageBody.Failed(error)

            else -> UsageBody.Loading
        }
        return UsageUiState(
            body = body,
            reminders = s.reminders,
            remindersSupported = s.remindersSupported,
            now = now.toDouble(),
            macNow = s.macMillis(now)
        )
    }

    fun open() {
        usage?.screenDidOpen()
    }

    fun close() {
        usage?.screenDidClose()
    }

    suspend fun refresh() {
        usage?.refresh()
    }

    fun retry() {
        viewModelScope.launch { refresh() }
    }

    fun toggleReminder(limit: String, window: String, win: LimitWindow, name: String) {
        usage?.toggleReminder(limit, window, win, name)
    }

    @AssistedFactory
    interface Factory {
        fun create(key: UsageKey): UsageViewModel
    }
}
