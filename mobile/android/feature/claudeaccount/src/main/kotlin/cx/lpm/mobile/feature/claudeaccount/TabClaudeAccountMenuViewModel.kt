package cx.lpm.mobile.feature.claudeaccount

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.terminals.canSwitchTabAccounts
import cx.lpm.mobile.core.data.terminals.switchTerminalAccount
import cx.lpm.mobile.core.data.usage.UsageState
import cx.lpm.mobile.core.data.usage.UsageStore
import cx.lpm.mobile.core.model.ClaudeAccountInfo
import cx.lpm.mobile.core.model.ClaudeAccounts
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.claudeUsageLine
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

data class TabClaudeAccountMenuUiState(
    /** Null until the Mac first answers `claudeAccounts`. */
    val accounts: ClaudeAccounts? = null,
    /** Each account's "5h 72% · 7d 41%", for those with a current reading. */
    val usage: Map<String, String> = emptyMap(),
    /** The Mac moves tabs between accounts (`tabAccount`). */
    val canSwitch: Boolean = false
)

/**
 * A Claude tab's "Claude Account" submenu (iOS `TabClaudeAccountMenu`): the account the
 * tab's conversation runs as, and the Mac's other accounts to continue it on.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = TabClaudeAccountMenuViewModel.Factory::class)
class TabClaudeAccountMenuViewModel @AssistedInject constructor(
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    val uiState: StateFlow<TabClaudeAccountMenuUiState> = sessions.session(sessionKey)
        .flatMapLatest { s -> s?.let(::menuState) ?: flowOf(TabClaudeAccountMenuUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), current())

    private fun menuState(s: MacSession): Flow<TabClaudeAccountMenuUiState> = combine(
        s.state,
        s.store<ClaudeAccountsStore>().state,
        s.store<UsageStore>().state
    ) { _, accounts, usage -> uiState(s, accounts.accounts, usage) }

    private fun current(): TabClaudeAccountMenuUiState {
        val s = sessions[sessionKey] ?: return TabClaudeAccountMenuUiState()
        return uiState(
            s,
            s.store<ClaudeAccountsStore>().state.value.accounts,
            s.store<UsageStore>().state.value
        )
    }

    private fun uiState(
        s: MacSession,
        accounts: ClaudeAccounts?,
        usage: UsageState
    ): TabClaudeAccountMenuUiState {
        val now = clock.millis().toDouble()
        return TabClaudeAccountMenuUiState(
            accounts = accounts,
            usage = accounts?.accounts.orEmpty().mapNotNull { a ->
                claudeUsageLine(usage.snapshot, a.id, now)?.let { a.id to it }
            }.toMap(),
            canSwitch = s.store<TerminalsStore>().canSwitchTabAccounts
        )
    }

    /** Continues [term]'s conversation on [account]; true when it was sent. */
    fun switch(term: TerminalInfo, account: ClaudeAccountInfo): Boolean =
        sessions[sessionKey]?.store<TerminalsStore>()?.switchTerminalAccount(term, account) == true

    @AssistedFactory
    interface Factory {
        fun create(sessionKey: SessionKey): TabClaudeAccountMenuViewModel
    }
}
