package cx.lpm.mobile.feature.projects.list

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.WorkStatusChoice
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.menu.WorkStatusSubmenu

/** What a project row's menu and swipe can do; each takes the row's project. */
@Immutable
class ProjectRowActions(
    val open: (Project) -> Unit = {},
    val start: (Project, profile: String) -> Unit = { _, _ -> },
    val pickStatus: (Project, WorkStatusChoice?) -> Unit = { _, _ -> },
    val move: (Project, folder: String?) -> Unit = { _, _ -> },
    val newFolderFor: (Project) -> Unit = {},
    val duplicate: (Project) -> Unit = {},
    val remove: (Project) -> Unit = {},
    val openTerminal: (Project, terminalId: String) -> Unit = { _, _ -> },
    val toggleSeenAgents: (Project) -> Unit = {},
    val setPinned: (Project, pinned: Boolean) -> Unit = { _, _ -> },
    val archiveAgent: (Project, ProjectAgentRow) -> Unit = { _, _ -> },
    val markAgentSeen: (Project, ProjectAgentRow) -> Unit = { _, _ -> },
    val markAgentUnread: (Project, ProjectAgentRow) -> Unit = { _, _ -> },
    val cancelQueued: (id: String) -> Unit = {},
    val retryQueued: (id: String) -> Unit = {},
    /** Asks for a waiting agent's dialog while its row is on screen. */
    val followDialog: suspend (Project, terminal: String, key: String) -> Unit = { _, _, _ -> },
    /** Answers a waiting agent's dialog with one of its options. */
    val pickDialog: (AgentDialogRead, AgentDialogOption) -> Unit = { _, _ -> }
)

/** Whether a long press on the row has anything to offer; [pinned] null hides Pin to top. */
fun Project.hasRowMenu(pinned: Boolean? = null): Boolean =
    (!running && profiles.isNotEmpty()) || canHaveWorkStatus || pinned != null || !isRemote ||
        isDuplicate

/**
 * The project row's long-press menu, matching the desktop's but scoped to what's
 * safe from a phone: start with a profile, its status, Pin to top or Unpin (when the
 * Mac pins projects, [pinned] not null), its folder, Duplicate, and Remove for a
 * duplicate (which deletes its folder, so it's confirmed first).
 */
@Composable
fun ProjectRowMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    project: Project,
    folderId: String?,
    folders: List<ProjectFolder>,
    statusChoices: List<WorkStatusChoice>,
    actions: ProjectRowActions,
    modifier: Modifier = Modifier,
    pinned: Boolean? = null
) {
    ContextMenu(expanded = expanded, onDismissRequest = onDismiss, modifier = modifier) {
        if (!project.running && project.profiles.isNotEmpty()) {
            ContextMenuSubmenu(
                title = stringResource(ProjectsR.string.row_start_with_profile),
                icon = painterResource(R.drawable.ic_play_circle)
            ) {
                project.profiles.forEach { profile ->
                    ContextMenuItem(
                        title = profile.name,
                        onClick = { actions.start(project, profile.name) }
                    )
                }
            }
        }
        if (project.canHaveWorkStatus) {
            WorkStatusSubmenu(project.workStatus, statusChoices) { actions.pickStatus(project, it) }
        }
        if (pinned != null) {
            ContextMenuItem(
                title = stringResource(
                    if (pinned) ProjectsR.string.row_unpin else ProjectsR.string.row_pin
                ),
                onClick = { actions.setPinned(project, !pinned) },
                icon = painterResource(if (pinned) R.drawable.ic_keep_off else R.drawable.ic_keep)
            )
        }
        if (!project.isRemote) {
            ContextMenuSubmenu(
                title = stringResource(ProjectsR.string.row_move_to_folder),
                icon = painterResource(R.drawable.ic_folder)
            ) {
                folders.filter { it.id != folderId }.forEach { folder ->
                    ContextMenuItem(title = folder.name, onClick = {
                        actions.move(project, folder.name)
                    })
                }
                ContextMenuItem(
                    title = stringResource(ProjectsR.string.row_new_folder),
                    onClick = { actions.newFolderFor(project) },
                    icon = painterResource(R.drawable.ic_create_new_folder)
                )
                if (folderId != null) {
                    ContextMenuDivider()
                    ContextMenuItem(
                        title = stringResource(ProjectsR.string.row_no_folder),
                        onClick = { actions.move(project, null) },
                        icon = painterResource(R.drawable.ic_folder_off)
                    )
                }
            }
            ContextMenuItem(
                title = stringResource(ProjectsR.string.row_duplicate),
                onClick = { actions.duplicate(project) },
                icon = painterResource(R.drawable.ic_library_add)
            )
        }
        if (project.isDuplicate) {
            ContextMenuItem(
                title = stringResource(ProjectsR.string.row_remove_duplicate),
                onClick = { actions.remove(project) },
                icon = painterResource(R.drawable.ic_delete),
                destructive = true
            )
        }
    }
}
