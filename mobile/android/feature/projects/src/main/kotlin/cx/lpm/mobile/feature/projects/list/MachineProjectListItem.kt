package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.listSeparator

/**
 * A project of one of the Mac's machines. It lives on that machine, so it opens in a
 * session of its own — directly, or through the Mac when the machine isn't on this
 * phone — while this Mac stays connected. Grayed out while it can't be opened.
 */
@Composable
fun MachineProjectListItem(
    entry: ProjectsListRow.MachineProjectEntry,
    actions: MachineActions,
    edgeRows: AgentEdgeRows,
    modifier: Modifier = Modifier
) {
    val project = entry.project
    Column(
        modifier.listSeparator(
            startInset = MachineIndent + ListDefaults.RowPadding + ListDefaults.DotSlot.width +
                ListDefaults.DotSlot.spacing
        )
    ) {
        ProjectRow(
            project = project,
            onOpen = { actions.open(entry.slug, project.name) },
            stale = entry.stale,
            agentCount = entry.agents.size,
            indent = MachineIndent,
            enabled = entry.canOpen
        )
        if (entry.agents.isNotEmpty()) {
            ProjectTerminalDeck(
                rows = entry.agents,
                edgeRows = edgeRows,
                edgeKey = entry.key,
                onOpen = { row ->
                    row.terminalId?.let { actions.openTerminal(entry.slug, project.name, it) }
                },
                enabled = entry.canOpen,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(
                        start = ListDefaults.RowPadding + DeckInset + MachineIndent,
                        end = ListDefaults.RowPadding,
                        bottom = 8.dp
                    )
            )
        }
    }
}

private val MachineIndent = 20.dp

/** The deck starts beneath the project's name: the dot's 14 dp column and the gap. */
private val DeckInset = 22.dp
