package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.GlassIconButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R as ProjectsR

/** Where the projects "…" menu leads; the update and pairing rows are other features'. */
@Immutable
class ProjectsMenuActions(
    val automations: () -> Unit = {},
    val stats: () -> Unit = {},
    val usage: () -> Unit = {},
    val settings: () -> Unit = {},
    val addProject: () -> Unit = {},
    val newFolder: () -> Unit = {},
    val updateItem: @Composable ColumnScope.() -> Unit = {},
    val pairDirectlyItems: @Composable ColumnScope.() -> Unit = {}
)

/**
 * The projects list's "…" button and its menu. A dot on it says an automation has
 * news, whose count rides in the Automations row.
 */
@Composable
fun ProjectsMoreButton(
    automationsUnread: Int,
    actions: ProjectsMenuActions,
    modifier: Modifier = Modifier
) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        GlassIconButton(
            icon = painterResource(R.drawable.ic_more_horiz),
            contentDescription = stringResource(
                if (automationsUnread > 0) {
                    ProjectsR.string.projects_more_automations
                } else {
                    ProjectsR.string.projects_more
                }
            ),
            onClick = { open = true },
            iconSize = 28.dp
        )
        if (automationsUnread > 0) {
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .offset(x = (-3).dp, y = 9.dp)
                    .size(8.dp)
                    .background(LpmTheme.colors.tint, CircleShape)
            )
        }
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            ContextMenuItem(
                title = if (automationsUnread > 0) {
                    stringResource(ProjectsR.string.menu_automations_count, automationsUnread)
                } else {
                    stringResource(ProjectsR.string.menu_automations)
                },
                onClick = actions.automations,
                icon = painterResource(R.drawable.ic_history)
            )
            ContextMenuItem(
                title = stringResource(ProjectsR.string.menu_stats),
                onClick = actions.stats,
                icon = painterResource(R.drawable.ic_bar_chart)
            )
            ContextMenuItem(
                title = stringResource(ProjectsR.string.menu_usage),
                onClick = actions.usage,
                icon = painterResource(R.drawable.ic_speed)
            )
            ContextMenuItem(
                title = stringResource(ProjectsR.string.menu_settings),
                onClick = actions.settings,
                icon = painterResource(R.drawable.ic_settings)
            )
            actions.updateItem(this)
            ContextMenuDivider()
            ContextMenuItem(
                title = stringResource(ProjectsR.string.menu_add_project),
                onClick = actions.addProject,
                icon = painterResource(R.drawable.ic_add_box)
            )
            ContextMenuItem(
                title = stringResource(ProjectsR.string.menu_new_folder),
                onClick = actions.newFolder,
                icon = painterResource(R.drawable.ic_create_new_folder)
            )
            actions.pairDirectlyItems(this)
        }
    }
}
