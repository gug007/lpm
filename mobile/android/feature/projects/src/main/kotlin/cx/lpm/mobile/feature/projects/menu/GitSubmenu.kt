package cx.lpm.mobile.feature.projects.menu

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.GitAutoKind
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.autoPullEnabled
import cx.lpm.mobile.feature.projects.R as ProjectsR

/**
 * The desktop's project Git submenu, adapted to a phone: sync ops that fire at once
 * (off while in flight) and auto pull, then branch, pull request and History screens, the AI
 * commit shortcuts, then copying the branch and the destructive discard.
 */
@Composable
fun ColumnScope.GitSubmenu(state: ProjectMenuUiState, project: Project, actions: GitMenuActions) {
    val changed = state.changedCount ?: 0
    ContextMenuSubmenu(
        title = stringResource(ProjectsR.string.menu_git),
        icon = painterResource(R.drawable.ic_call_split)
    ) {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.git_pull),
            onClick = actions.pull,
            icon = painterResource(R.drawable.ic_arrow_downward),
            enabled = !state.pulling
        )
        ContextMenuItem(
            title = stringResource(ProjectsR.string.git_push),
            onClick = actions.push,
            icon = painterResource(R.drawable.ic_arrow_upward),
            enabled = !state.pushing
        )
        ContextMenuItem(
            title = stringResource(ProjectsR.string.git_fetch),
            onClick = actions.fetch,
            icon = painterResource(R.drawable.ic_sync),
            enabled = !state.fetching
        )
        AutoPullItems(state, project, actions)
        ContextMenuDivider()
        ContextMenuItem(
            title = stringResource(ProjectsR.string.git_switch_branch),
            onClick = actions.switchBranch,
            icon = painterResource(R.drawable.ic_call_split)
        )
        if (state.ghCli) {
            ContextMenuItem(
                title = stringResource(ProjectsR.string.git_create_pr),
                onClick = actions.createPullRequest,
                icon = painterResource(R.drawable.ic_merge)
            )
        }
        if (state.canShowHistory) {
            ContextMenuItem(
                title = stringResource(ProjectsR.string.git_history),
                onClick = actions.history,
                icon = painterResource(R.drawable.ic_schedule)
            )
        }
        ContextMenuDivider()
        val kinds = if (state.ghCli) GitAutoKind.entries else GitAutoKind.entries - GitAutoKind.Pr
        // While a run is going every item reopens its progress, so the one in flight
        // reads as such; otherwise the commit items need changes to commit.
        val running = state.autoRunning != null
        val inFlight = stringResource(ProjectsR.string.git_auto_running)
        kinds.forEach { kind ->
            ContextMenuItem(
                title = kind.title,
                subtitle = if (state.autoRunning == kind) inFlight else kind.subtitle,
                onClick = { actions.auto(kind) },
                icon = painterResource(R.drawable.ic_auto_awesome),
                enabled = running || kind == GitAutoKind.Pr || changed > 0
            )
        }
        ContextMenuDivider()
        ContextMenuItem(
            title = stringResource(ProjectsR.string.git_copy_branch),
            onClick = actions.copyBranch,
            icon = painterResource(R.drawable.ic_content_copy),
            enabled = state.branch.isNotEmpty()
        )
        ContextMenuItem(
            title = stringResource(ProjectsR.string.git_discard),
            onClick = actions.discard,
            icon = painterResource(R.drawable.ic_delete),
            destructive = true,
            enabled = changed > 0
        )
    }
}

/**
 * "Auto Pull ▸" with the project's own choice (follow, On, Off), dimmed while the
 * Mac has auto pull off entirely, then Undo Auto Pull while lpm's last one can be
 * undone.
 */
@Composable
private fun ColumnScope.AutoPullItems(
    state: ProjectMenuUiState,
    project: Project,
    actions: GitMenuActions
) {
    val title = stringResource(ProjectsR.string.auto_pull)
    val icon = painterResource(R.drawable.ic_arrow_circle_down)
    // iOS draws these rows' title alone, without the line naming the Mac's setting or
    // the choice in effect.
    if (state.autoPullMode == AutoPullMode.Off) {
        ContextMenuItem(title = title, onClick = {}, icon = icon, enabled = false)
    } else {
        val selected = stringResource(ProjectsR.string.auto_pull_selected)
        ContextMenuSubmenu(title = title, icon = icon) {
            listOf(null, true, false).forEach { value ->
                val on = project.autoPull == value
                ContextMenuItem(
                    title = autoPullTitle(value, state, project),
                    onClick = { actions.setAutoPull(value) },
                    icon = if (on) painterResource(R.drawable.ic_check) else null,
                    iconDescription = selected.takeIf { on }
                )
            }
        }
    }
    state.autoPulled?.let { pulled ->
        ContextMenuItem(
            title = stringResource(ProjectsR.string.auto_pull_undo),
            subtitle = pulled.summary,
            onClick = actions.undoAutoPull,
            icon = painterResource(R.drawable.ic_undo),
            enabled = !state.undoingAutoPull
        )
    }
}

/**
 * Following names what it resolves to right now, so the menu reads as the
 * desktop's does: "Default (On)", or "Same as <parent> (Off)".
 */
@Composable
private fun autoPullTitle(value: Boolean?, state: ProjectMenuUiState, project: Project): String {
    if (value != null) {
        return stringResource(
            if (value) ProjectsR.string.auto_pull_on else ProjectsR.string.auto_pull_off
        )
    }
    val resolved = stringResource(
        if (autoPullEnabled(own = null, parent = state.parent, mode = state.autoPullMode)) {
            ProjectsR.string.auto_pull_on
        } else {
            ProjectsR.string.auto_pull_off
        }
    )
    if (!project.isDuplicate) return stringResource(ProjectsR.string.auto_pull_default, resolved)
    val parent = state.parent?.label ?: project.parentName
    return stringResource(ProjectsR.string.auto_pull_same_as, parent, resolved)
}
