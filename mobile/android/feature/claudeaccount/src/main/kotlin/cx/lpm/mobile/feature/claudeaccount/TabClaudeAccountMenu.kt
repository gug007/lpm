package cx.lpm.mobile.feature.claudeaccount

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenuSectionHeader
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.model.ClaudeAccountInfo
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo

/** "Claude Account ▸" in a Claude tab's long press, while the Mac has an account beyond the main login. */
@Composable
fun ColumnScope.TabClaudeAccountMenuRoute(
    session: SessionKey,
    term: TerminalInfo,
    working: Boolean,
    viewModel: TabClaudeAccountMenuViewModel =
        hiltViewModel<TabClaudeAccountMenuViewModel, TabClaudeAccountMenuViewModel.Factory>(
            key = "tab-claude-account:$session",
            creationCallback = { it.create(session) }
        )
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    TabClaudeAccountMenu(state, term, working) { account ->
        if (viewModel.switch(term, account)) {
            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        }
    }
}

/**
 * The account the tab's conversation runs as, and the Mac's other accounts to continue
 * it on, each with its usage, as on the desktop. A turn in progress is interrupted and
 * carried on there.
 */
@Composable
fun ColumnScope.TabClaudeAccountMenu(
    state: TabClaudeAccountMenuUiState,
    term: TerminalInfo,
    working: Boolean,
    onPick: (ClaudeAccountInfo) -> Unit
) {
    val accounts = state.accounts ?: return
    if (!state.canSwitch || !term.canSwitchAccount || !accounts.hasAdded) return
    ContextMenuSubmenu(
        title = stringResource(R.string.claudeaccount_title),
        icon = painterResource(DesignR.drawable.ic_account_circle),
        subtitle = term.claudeAccount?.let(accounts::label)
    ) {
        val heading = if (working) {
            R.string.claudeaccount_tab_interrupt
        } else {
            R.string.claudeaccount_tab_continue
        }
        ContextMenuSectionHeader(stringResource(heading))
        val notSignedIn = stringResource(R.string.claudeaccount_not_signed_in)
        accounts.accounts.forEach { a ->
            val current = a.id == term.claudeAccount
            Choice(
                title = a.label,
                subtitle = if (a.signedIn) state.usage[a.id] else notSignedIn,
                on = current,
                enabled = a.signedIn || current,
                onClick = { onPick(a) }
            )
        }
    }
}
