package cx.lpm.mobile.feature.projects.list

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.feature.projects.R as ProjectsR

/**
 * What an agent row does besides opening, from a Mac that archives agents. [markSeen]
 * is null while the Mac keeps no finished agents: it would archive them instead.
 */
@Immutable
class AgentRowActions(
    val archive: (ProjectAgentRow) -> Unit = {},
    val markSeen: ((ProjectAgentRow) -> Unit)? = null,
    val markUnread: (ProjectAgentRow) -> Unit = {}
)

/**
 * An agent row's long-press menu: Open, then for a finished turn Mark as Seen (or
 * Mark as Unread once seen) and Archive. A running or waiting agent offers only
 * Open: archiving it would hide work still going, or a question still waiting on an
 * answer. A row with no tab has nothing to open.
 */
@Composable
fun AgentRowMenu(
    expanded: Boolean,
    onDismiss: () -> Unit,
    row: ProjectAgentRow,
    onOpen: (() -> Unit)?,
    actions: AgentRowActions,
    modifier: Modifier = Modifier
) {
    ContextMenu(expanded = expanded, onDismissRequest = onDismiss, modifier = modifier) {
        if (onOpen != null) {
            ContextMenuItem(
                title = stringResource(ProjectsR.string.agent_open),
                icon = painterResource(R.drawable.ic_terminal),
                onClick = onOpen
            )
        }
        if (row.state.isFinished) {
            if (row.seen) {
                ContextMenuItem(
                    title = stringResource(ProjectsR.string.agent_mark_unread),
                    icon = painterResource(R.drawable.ic_mark_email_unread),
                    onClick = { actions.markUnread(row) }
                )
            } else if (actions.markSeen != null) {
                ContextMenuItem(
                    title = stringResource(ProjectsR.string.agent_mark_seen),
                    icon = painterResource(R.drawable.ic_drafts),
                    onClick = { actions.markSeen(row) }
                )
            }
            ContextMenuItem(
                title = stringResource(ProjectsR.string.agent_archive),
                icon = painterResource(R.drawable.ic_archive),
                onClick = { actions.archive(row) }
            )
        }
    }
}
