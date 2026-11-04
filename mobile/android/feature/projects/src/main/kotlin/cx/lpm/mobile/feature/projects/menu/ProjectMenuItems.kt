package cx.lpm.mobile.feature.projects.menu

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitAutoKind
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.WorkStatusChoice
import cx.lpm.mobile.feature.projects.R as ProjectsR

/** What the project menu's rows do; navigation goes to features that may not be ported yet. */
@Immutable
class ProjectMenuActions(
    /** Find in the terminal the menu sits over; null leaves the item out. */
    val find: (() -> Unit)? = null,
    val start: (profile: String) -> Unit = {},
    val stop: () -> Unit = {},
    val reviewChanges: () -> Unit = {},
    /** Null leaves the item out: the Mac can't answer it, or the project is on SSH. */
    val files: (() -> Unit)? = null,
    val resumeSession: (() -> Unit)? = null,
    val memory: () -> Unit = {},
    /** Null leaves Commands out: the Mac doesn't keep lpm commands. */
    val commands: (() -> Unit)? = null,
    val notes: () -> Unit = {},
    val automations: () -> Unit = {},
    val pickStatus: (WorkStatusChoice?) -> Unit = {},
    val rename: () -> Unit = {},
    val configure: () -> Unit = {},
    val terminalSettings: () -> Unit = {},
    val git: GitMenuActions = GitMenuActions(),
    val ci: @Composable ColumnScope.() -> Unit = {},
    val claudeAccount: @Composable ColumnScope.() -> Unit = {}
)

/**
 * The project's "More" menu: Find in Terminal over a terminal, then Start/Stop, Review
 * Changes, Files, Resume Session, Git, CI, Memory, Commands, Notes, Automations, Claude
 * Account, Status, its profiles, then Rename, Configure and Terminal Settings.
 */
@Composable
fun ColumnScope.ProjectMenuItems(
    state: ProjectMenuUiState,
    project: Project,
    actions: ProjectMenuActions,
    renamesTab: Boolean = false
) {
    val running = project.running
    actions.find?.let {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.menu_find_in_terminal),
            onClick = it,
            icon = painterResource(R.drawable.ic_search)
        )
        ContextMenuDivider()
    }
    // A YAML the Mac can't read has nothing to start, as on the desktop.
    if (running || project.configError == null) {
        ContextMenuItem(
            title = stringResource(
                if (running) ProjectsR.string.menu_stop else ProjectsR.string.menu_start
            ),
            onClick = { if (running) actions.stop() else actions.start(project.activeProfile) },
            icon = painterResource(
                if (running) R.drawable.ic_stop_fill else R.drawable.ic_play_arrow_fill
            )
        )
    }
    val changed = state.changedCount
    ContextMenuItem(
        title = stringResource(ProjectsR.string.menu_review_changes),
        onClick = actions.reviewChanges,
        icon = painterResource(R.drawable.ic_checklist),
        subtitle = if (changed != null && changed > 0) {
            pluralStringResource(ProjectsR.plurals.menu_changed_files, changed, changed)
        } else {
            null
        }
    )
    actions.files?.let {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.menu_files),
            onClick = it,
            icon = painterResource(R.drawable.ic_folder)
        )
    }
    actions.resumeSession?.let {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.menu_resume_session),
            onClick = it,
            icon = painterResource(R.drawable.ic_history)
        )
    }
    GitSubmenu(state, project, actions.git)
    actions.ci(this)
    // Memory is Mac-local: an SSH project's agents run on the other host. Notes are
    // stored per project on the Mac either way.
    if (!project.isRemote) {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.menu_memory),
            onClick = actions.memory,
            icon = painterResource(R.drawable.ic_psychology)
        )
    }
    actions.commands?.let {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.menu_commands),
            onClick = it,
            icon = painterResource(R.drawable.ic_slash_circle)
        )
    }
    ContextMenuItem(
        title = stringResource(ProjectsR.string.menu_notes),
        onClick = actions.notes,
        icon = painterResource(R.drawable.ic_article)
    )
    // Jobs run on the Mac in the project's own folder, so an SSH project has none.
    if (!project.isRemote) {
        ContextMenuItem(
            title = stringResource(ProjectsR.string.menu_automations),
            onClick = actions.automations,
            icon = painterResource(R.drawable.ic_history),
            subtitle = if (state.unreadAutomations > 0) {
                pluralStringResource(
                    ProjectsR.plurals.menu_new_runs,
                    state.unreadAutomations,
                    state.unreadAutomations
                )
            } else {
                null
            }
        )
        actions.claudeAccount(this)
    }
    if (project.canHaveWorkStatus) {
        WorkStatusSubmenu(project.workStatus, state.statusChoices, actions.pickStatus)
    }
    if (project.profiles.isNotEmpty()) {
        ContextMenuDivider()
        MenuSectionHeader(stringResource(ProjectsR.string.menu_profiles))
        project.profiles.forEach { profile ->
            ContextMenuItem(
                title = profile.name,
                onClick = { actions.start(profile.name) },
                icon = if (running && project.activeProfile == profile.name) {
                    painterResource(R.drawable.ic_check)
                } else {
                    null
                }
            )
        }
    }
    ContextMenuDivider()
    ContextMenuItem(
        title = stringResource(
            if (renamesTab) ProjectsR.string.menu_rename_tab else ProjectsR.string.menu_rename
        ),
        onClick = actions.rename,
        icon = painterResource(R.drawable.ic_edit)
    )
    ContextMenuItem(
        title = stringResource(ProjectsR.string.menu_configure),
        onClick = actions.configure,
        icon = painterResource(R.drawable.ic_tune)
    )
    ContextMenuItem(
        title = stringResource(ProjectsR.string.menu_terminal_settings),
        onClick = actions.terminalSettings,
        icon = painterResource(R.drawable.ic_format_size)
    )
}

/** A menu section's small gray title ("Profiles"). */
@Composable
private fun MenuSectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = LpmTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
        color = LpmTheme.colors.secondaryLabel,
        modifier = modifier
            .fillMaxWidth()
            .padding(start = 28.dp, end = 27.dp, top = 4.dp, bottom = 4.dp)
    )
}

/** What the Git submenu's rows do. */
@Immutable
class GitMenuActions(
    val pull: () -> Unit = {},
    val push: () -> Unit = {},
    val fetch: () -> Unit = {},
    val setAutoPull: (Boolean?) -> Unit = {},
    val undoAutoPull: () -> Unit = {},
    val switchBranch: () -> Unit = {},
    val createPullRequest: () -> Unit = {},
    val history: () -> Unit = {},
    val auto: (GitAutoKind) -> Unit = {},
    val copyBranch: () -> Unit = {},
    val discard: () -> Unit = {}
)
