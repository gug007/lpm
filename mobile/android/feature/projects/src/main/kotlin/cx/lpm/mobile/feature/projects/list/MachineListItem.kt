package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.listSeparator
import cx.lpm.mobile.feature.projects.R as ProjectsR

/** What a machine's section does: open or shut it, switch to it, open its projects. */
@Immutable
class MachineActions(
    val toggle: (slug: String, expandedNow: Boolean) -> Unit = { _, _ -> },
    val switchTo: (slug: String) -> Unit = {},
    val open: (slug: String, project: String) -> Unit = { _, _ -> },
    val openTerminal: (slug: String, project: String, terminal: String) -> Unit = { _, _, _ -> }
)

/** A machine's header over its card, with "Switch to …" on a long press when it opens. */
@Composable
fun MachineListItem(
    entry: ProjectsListRow.MachineEntry,
    actions: MachineActions,
    modifier: Modifier = Modifier
) {
    var menuOpen by remember { mutableStateOf(false) }
    Box(modifier) {
        MachineHeader(
            entry = entry,
            onToggle = { actions.toggle(entry.slug, entry.expanded) },
            onOpen = { actions.switchTo(entry.slug) },
            onLongPress = if (entry.canOpen) ({ menuOpen = true }) else null
        )
        ContextMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
            ContextMenuItem(
                title = stringResource(ProjectsR.string.machine_section_switch, entry.name),
                onClick = { actions.switchTo(entry.slug) },
                icon = painterResource(R.drawable.ic_swap_horiz)
            )
        }
    }
}
