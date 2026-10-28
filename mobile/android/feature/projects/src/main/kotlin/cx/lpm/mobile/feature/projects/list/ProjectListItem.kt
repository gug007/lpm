package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.SwipeAction
import cx.lpm.mobile.core.designsystem.component.SwipeActionsBox
import cx.lpm.mobile.core.designsystem.component.listSeparator
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.WorkStatusChoice
import cx.lpm.mobile.feature.projects.R as ProjectsR

private val FolderIndent = 20.dp

/**
 * A project of the list as one cell of the card: its row (open on tap, a menu on
 * long press, Duplicate and Remove on a swipe) and, flush under it, the deck of
 * terminals it has going.
 */
@Composable
fun ProjectListItem(
    entry: ProjectsListRow.ProjectEntry,
    folders: List<ProjectFolder>,
    statusChoices: List<WorkStatusChoice>,
    actions: ProjectRowActions,
    modifier: Modifier = Modifier
) {
    val project = entry.project
    val indent = if (entry.indented) FolderIndent else 0.dp
    var menuOpen by remember { mutableStateOf(false) }
    val colors = LpmTheme.colors
    val trailing = buildList {
        if (project.isDuplicate) {
            add(
                SwipeAction(
                    stringResource(ProjectsR.string.row_remove),
                    R.drawable.ic_delete,
                    colors.red
                ) { actions.remove(project) }
            )
        }
        if (!project.isRemote) {
            add(
                SwipeAction(
                    stringResource(ProjectsR.string.row_duplicate),
                    R.drawable.ic_library_add,
                    colors.indigo
                ) { actions.duplicate(project) }
            )
        }
    }
    Column(
        modifier.listSeparator(
            startInset = indent + ListDefaults.RowPadding + ListDefaults.DotSlot.width +
                ListDefaults.DotSlot.spacing
        )
    ) {
        SwipeActionsBox(trailing = trailing) {
            ProjectRow(
                project = project,
                onOpen = { actions.open(project) },
                pending = entry.pending,
                stale = entry.stale,
                agentCount = entry.agents.count { !it.seen },
                indent = indent,
                queued = entry.queued,
                onCancelAction = actions.cancelQueued,
                onRetryAction = actions.retryQueued,
                onLongPress = if (project.hasRowMenu()) ({ menuOpen = true }) else null
            )
            ProjectRowMenu(
                expanded = menuOpen,
                onDismiss = { menuOpen = false },
                project = project,
                folderId = entry.folderId,
                folders = folders,
                statusChoices = statusChoices,
                actions = actions
            )
        }
        if (entry.agents.isNotEmpty()) {
            val agentActions = remember(entry.archivable, entry.keepsFinished, project, actions) {
                if (entry.archivable) {
                    AgentRowActions(
                        archive = { actions.archiveAgent(project, it) },
                        markSeen = if (entry.keepsFinished) {
                            { actions.markAgentSeen(project, it) }
                        } else {
                            null
                        },
                        markUnread = { actions.markAgentUnread(project, it) }
                    )
                } else {
                    null
                }
            }
            ProjectTerminalDeck(
                rows = entry.agents,
                onOpen = { row -> row.terminalId?.let { actions.openTerminal(project, it) } },
                folded = entry.foldedSeen,
                expanded = entry.seenExpanded,
                onToggleFold = { actions.toggleSeenAgents(project) },
                actions = agentActions,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = ListDefaults.RowPadding + DeckInset + indent,
                        end = ListDefaults.RowPadding,
                        bottom = 8.dp
                    )
            )
        }
    }
}

/** The deck starts beneath the project's name: the dot's 14 dp column and the gap. */
private val DeckInset = 22.dp
