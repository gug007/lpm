package cx.lpm.mobile.feature.files.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** One Go to File result (iOS `GoToFileRow`): the name over the folder it's in. [note] is said at the row's end. */
@Composable
internal fun GoToFileRow(
    path: String,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier,
    isFolder: Boolean = false,
    note: String? = null
) {
    val colors = LpmTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val folder = folderOf(path)
    ListRow(
        modifier = modifier
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onOpen
            )
            .background(if (pressed) colors.gray4 else Color.Transparent),
        verticalPadding = if (folder.isEmpty()) 12.dp else 8.dp,
        leading = {
            Icon(
                painter = painterResource(if (isFolder) FolderIcon else FileIcon),
                contentDescription = null,
                tint = if (isFolder) colors.blue else colors.secondaryLabel,
                modifier = Modifier.size(24.dp)
            )
        },
        leadingSlot = FileIconSlot,
        trailing = {
            note?.let {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = it,
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel,
                    maxLines = 1
                )
            }
            if (isFolder) {
                Spacer(Modifier.width(8.dp))
                DisclosureChevron()
            }
        }
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = fileName(path).ifEmpty { path },
                style = LpmTheme.typography.body,
                color = colors.label,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis
            )
            if (folder.isNotEmpty()) {
                Text(
                    text = folder,
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel,
                    maxLines = 1,
                    overflow = TextOverflow.StartEllipsis
                )
            }
        }
    }
}
