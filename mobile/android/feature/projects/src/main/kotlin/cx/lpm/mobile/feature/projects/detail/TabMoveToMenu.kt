package cx.lpm.mobile.feature.projects.detail

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSectionHeader
import cx.lpm.mobile.core.designsystem.component.ContextMenuSubmenu
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.feature.projects.R as ProjectsR

/**
 * "Move To" in a tab's menu (iOS `TabMoveToMenu`, the desktop's Move to): the Mac's
 * other projects. The tab keeps running in the folder it started in.
 */
@Composable
internal fun ColumnScope.TabMoveToMenu(destinations: List<Project>, onPick: (Project) -> Unit) {
    ContextMenuSubmenu(
        title = stringResource(ProjectsR.string.tab_move_to),
        icon = painterResource(R.drawable.ic_folder)
    ) {
        ContextMenuSectionHeader(stringResource(ProjectsR.string.tab_move_to_note))
        destinations.forEach { p ->
            ContextMenuItem(title = p.label, onClick = { onPick(p) })
        }
    }
}
