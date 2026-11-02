package cx.lpm.mobile.feature.claudeaccount

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringArrayResource
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSectionHeader
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.model.CLAUDE_MAIN_LOGIN
import cx.lpm.mobile.core.model.ClaudeAccountChoice
import cx.lpm.mobile.core.model.ClaudeAccounts
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.SessionKey

/**
 * "Claude Account ▸" in a project's menu, while the Mac has an account beyond the main
 * login. A list that needs consent first is asked about by [ClaudeConsentPromptRoute].
 */
@Composable
fun ColumnScope.ClaudeAccountMenuRoute(
    session: SessionKey,
    project: String,
    viewModel: ClaudeAccountMenuViewModel = claudeAccountMenuViewModel(session, project)
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val haptics = LocalHapticFeedback.current
    val tap = { sent: Boolean ->
        if (sent) haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
    }
    ClaudeAccountMenu(
        state = state,
        onPick = { tap(viewModel.pick(it)) },
        onSetList = { tap(viewModel.setList(it)) }
    )
}

/** The menu and its consent prompt share one ViewModel per project menu. */
@Composable
internal fun claudeAccountMenuViewModel(
    session: SessionKey,
    project: String
): ClaudeAccountMenuViewModel =
    hiltViewModel<ClaudeAccountMenuViewModel, ClaudeAccountMenuViewModel.Factory>(
        key = "claude-account:$session:$project",
        creationCallback = { it.create(project, session) }
    )

/**
 * Which login new Claude sessions in this project use, as on the desktop: its parent's
 * choice (for a copy), the main accounts from the Mac's Settings, one account always,
 * or its own list to take turns on, with each account's usage beside it.
 */
@Composable
fun ColumnScope.ClaudeAccountMenu(
    state: ClaudeAccountMenuUiState,
    onPick: (ClaudeAccountChoice) -> Unit,
    onSetList: (List<String>) -> Unit
) {
    val accounts = state.accounts ?: return
    val project = state.project ?: return
    if (!accounts.hasAdded) return
    ContextMenuSubmenu(
        title = stringResource(R.string.claudeaccount_title),
        icon = painterResource(DesignR.drawable.ic_account_circle)
    ) {
        Choices(state, accounts, project, onPick, onSetList)
    }
}

@Composable
private fun ColumnScope.Choices(
    state: ClaudeAccountMenuUiState,
    accounts: ClaudeAccounts,
    project: Project,
    onPick: (ClaudeAccountChoice) -> Unit,
    onSetList: (List<String>) -> Unit
) {
    val own = project.claude
    val isCopy = project.isDuplicate
    if (isCopy) {
        Choice(
            title = stringResource(R.string.claudeaccount_same_as_parent),
            subtitle = accounts.describe(state.parentChoice),
            on = own.followsParent,
            onClick = { onPick(ClaudeAccountChoice.Parent) }
        )
    }
    Choice(
        title = stringResource(R.string.claudeaccount_main_accounts),
        subtitle = accounts.mainNow,
        on = own.usesMainAccounts(isCopy),
        onClick = { onPick(ClaudeAccountChoice.Main) }
    )
    ContextMenuDivider()
    ContextMenuSectionHeader(stringResource(R.string.claudeaccount_always_one))
    val notSignedIn = stringResource(R.string.claudeaccount_not_signed_in)
    accounts.accounts.forEach { a ->
        val id = if (a.id == CLAUDE_MAIN_LOGIN) "" else a.id
        Choice(
            title = a.label,
            subtitle = if (a.signedIn) state.usage[a.id] else notSignedIn,
            on = own.account == id,
            onClick = { onPick(ClaudeAccountChoice.Pin(id)) }
        )
    }
    ContextMenuDivider()
    val listed = own.list.isNotEmpty()
    ContextMenuSubmenu(
        title = stringResource(R.string.claudeaccount_choose),
        icon = if (listed) painterResource(DesignR.drawable.ic_check) else null,
        iconDescription = stringResource(R.string.claudeaccount_selected).takeIf { listed },
        subtitle = if (listed) {
            null
        } else {
            stringResource(R.string.claudeaccount_choose_hint, accounts.switching.maxMembers)
        }
    ) {
        ListChoices(state, accounts, project, onSetList)
    }
}

/**
 * Each tap adds an account to the end of the project's list or takes it out, and is
 * saved at once, so the list reads in the order it was built. Accounts in the list
 * come first, in their turn.
 */
@Composable
private fun ColumnScope.ListChoices(
    state: ClaudeAccountMenuUiState,
    accounts: ClaudeAccounts,
    project: Project,
    onSetList: (List<String>) -> Unit
) {
    val list = project.claude.list
    val members = list.mapNotNull(accounts::account)
    val rest = accounts.accounts.filter { it.id !in list }
    val switching = accounts.switching
    val full = list.size >= switching.maxMembers
    val current = switching.current[project.name]
    val heading = if (switching.enabled) {
        R.string.claudeaccount_turns
    } else {
        R.string.claudeaccount_switching_off
    }
    ContextMenuSectionHeader(stringResource(heading))
    val ordinals = stringArrayResource(R.array.claudeaccount_ordinals)
    val newSessions = stringResource(R.string.claudeaccount_new_sessions)
    members.forEachIndexed { i, a ->
        val parts = listOfNotNull(
            ordinals[minOf(i, ordinals.lastIndex)],
            newSessions.takeIf { a.id == current },
            state.usage[a.id]
        )
        Choice(
            title = a.label,
            subtitle = parts.joinToString(" · "),
            on = true,
            enabled = list.size != 1,
            onClick = { onSetList(list.filter { it != a.id }) }
        )
    }
    val fullNote = pluralStringResource(
        R.plurals.claudeaccount_full,
        switching.maxMembers,
        switching.maxMembers
    )
    rest.forEach { a ->
        val blocked = accounts.blocked(a) ?: fullNote.takeIf { full }
        Choice(
            title = a.label,
            subtitle = blocked ?: state.usage[a.id],
            on = false,
            enabled = blocked == null,
            onClick = { onSetList(list + a.id) }
        )
    }
}

/**
 * A choice with its checkmark when it's the one in effect. iOS draws a checked
 * choice's title alone, without the line under it.
 */
@Composable
internal fun ColumnScope.Choice(
    title: String,
    subtitle: String?,
    on: Boolean,
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    ContextMenuItem(
        title = title,
        subtitle = subtitle.takeUnless { on },
        onClick = onClick,
        icon = if (on) painterResource(DesignR.drawable.ic_check) else null,
        iconDescription = if (on) stringResource(R.string.claudeaccount_selected) else null,
        enabled = enabled
    )
}
