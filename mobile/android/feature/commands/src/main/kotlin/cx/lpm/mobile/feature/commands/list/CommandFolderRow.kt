package cx.lpm.mobile.feature.commands.list

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.SwipeAction
import cx.lpm.mobile.core.designsystem.component.SwipeActionsBox
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.folderLabel
import cx.lpm.mobile.feature.commands.R

/**
 * One folder of a command list (null for No folder) and how many commands it holds;
 * a named folder's long press and swipe offer Rename and Delete folder.
 */
@Composable
internal fun CommandFolderRow(
    row: FolderRowUi,
    onOpen: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val folder = row.folder
    if (folder == null) {
        FolderLine(row, onOpen, onLongPress = null, modifier = modifier)
        return
    }
    var menuOpen by remember { mutableStateOf(false) }
    val colors = LpmTheme.colors
    SwipeActionsBox(
        modifier = modifier,
        trailing = listOf(
            SwipeAction(
                stringResource(R.string.commands_rename),
                DesignR.drawable.ic_edit,
                colors.gray,
                onRename
            ),
            SwipeAction(
                stringResource(R.string.commands_delete_folder),
                DesignR.drawable.ic_delete,
                colors.red,
                onDelete
            )
        )
    ) {
        Box {
            FolderLine(row, onOpen, onLongPress = { menuOpen = true })
            ContextMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                ContextMenuItem(
                    title = stringResource(R.string.commands_rename),
                    onClick = onRename,
                    icon = painterResource(DesignR.drawable.ic_edit)
                )
                ContextMenuItem(
                    title = stringResource(R.string.commands_delete_folder),
                    onClick = onDelete,
                    icon = painterResource(DesignR.drawable.ic_delete),
                    destructive = true
                )
            }
        }
    }
}

@Composable
private fun FolderLine(
    row: FolderRowUi,
    onOpen: () -> Unit,
    onLongPress: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val icon = if (row.folder == null) DesignR.drawable.ic_inbox else DesignR.drawable.ic_folder
    ListRow(
        modifier = modifier,
        onClick = onOpen,
        onLongClick = onLongPress,
        leading = {
            Icon(
                painterResource(icon),
                contentDescription = null,
                tint = colors.tint
            )
        },
        trailing = {
            Text(
                text = row.count.toString(),
                style = LpmTheme.typography.body.copy(fontFeatureSettings = "tnum"),
                color = colors.secondaryLabel,
                maxLines = 1
            )
            Spacer(Modifier.width(13.dp))
            DisclosureChevron()
        }
    ) {
        Text(
            text = row.folder?.let(::folderLabel) ?: stringResource(R.string.commands_no_folder),
            style = LpmTheme.typography.body,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}
