package cx.lpm.mobile.feature.projects.menu

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.ContextMenuSectionHeader
import cx.lpm.mobile.core.model.TerminalViewChoice
import cx.lpm.mobile.core.model.TerminalViewMode
import cx.lpm.mobile.feature.projects.R as ProjectsR

/** The menu's View section: an agent tab as its terminal or as its conversation. */
@Composable
internal fun ColumnScope.TerminalViewItems(view: TerminalViewChoice) {
    ContextMenuSectionHeader(stringResource(ProjectsR.string.menu_view))
    TerminalViewMode.entries.forEach { mode ->
        val picked = mode == view.mode
        ContextMenuItem(
            title = stringResource(
                when (mode) {
                    TerminalViewMode.Terminal -> ProjectsR.string.menu_view_terminal
                    TerminalViewMode.Conversation -> ProjectsR.string.menu_view_conversation
                }
            ),
            onClick = { view.onPick(mode) },
            icon = painterResource(
                when (mode) {
                    TerminalViewMode.Terminal -> R.drawable.ic_terminal
                    TerminalViewMode.Conversation -> R.drawable.ic_chat_bubble
                }
            ),
            trailingIcon = if (picked) painterResource(R.drawable.ic_check) else null
        )
    }
    ContextMenuDivider()
}
