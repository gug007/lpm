package cx.lpm.mobile.feature.files.browser

import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ProjectFileEntry
import cx.lpm.mobile.core.ui.GitStatusBadge
import cx.lpm.mobile.feature.files.R

/** What a row's tap and long-press menu do; a null copy leaves its item out. */
@Immutable
class FileRowActions(
    val open: () -> Unit = {},
    val copyPath: (() -> Unit)? = null,
    val copyRelativePath: (() -> Unit)? = null
)

/**
 * A file or folder in Files (iOS `ProjectFileRow`): its icon and name, dimmed when git
 * ignores it, with a changed file's status letter or how many changed files a folder
 * holds. A folder opens with its chevron; the long press copies its path, or, for a
 * file, previews it too.
 */
@Composable
internal fun ProjectFileRow(
    entry: ProjectFileEntry,
    actions: FileRowActions,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    var menuOpen by remember { mutableStateOf(false) }
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    ListRow(
        modifier = modifier
            .combinedClickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onLongClick = { menuOpen = true },
                onClick = actions.open
            )
            .background(if (pressed) colors.gray4 else Color.Transparent),
        leading = {
            Icon(
                painter = painterResource(if (entry.dir) FolderIcon else FileIcon),
                contentDescription = null,
                tint = if (entry.dir) colors.blue else colors.secondaryLabel,
                modifier = Modifier
                    .size(24.dp)
                    .alpha(if (entry.ignored) IGNORED_ALPHA else 1f)
            )
        },
        leadingSlot = FileIconSlot,
        trailing = {
            entry.status?.let {
                Spacer(Modifier.width(8.dp))
                GitStatusBadge(it)
            }
            if (entry.dir && entry.changed > 0) {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = pluralStringResource(
                        R.plurals.files_changed,
                        entry.changed,
                        entry.changed
                    ),
                    style = LpmTheme.typography.subheadline,
                    color = colors.secondaryLabel,
                    maxLines = 1
                )
            }
            if (entry.dir) {
                Spacer(Modifier.width(8.dp))
                DisclosureChevron()
            }
        }
    ) {
        Text(
            text = entry.name,
            style = LpmTheme.typography.body,
            color = if (entry.ignored) colors.secondaryLabel else colors.label,
            maxLines = 1,
            overflow = TextOverflow.MiddleEllipsis
        )
        Box {
            ContextMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                if (!entry.dir) {
                    ContextMenuItem(
                        title = stringResource(R.string.files_preview),
                        onClick = actions.open,
                        icon = painterResource(DesignR.drawable.ic_visibility)
                    )
                }
                actions.copyPath?.let {
                    ContextMenuItem(
                        title = stringResource(R.string.files_copy_path),
                        onClick = it,
                        icon = painterResource(DesignR.drawable.ic_content_copy)
                    )
                }
                actions.copyRelativePath?.let {
                    ContextMenuItem(
                        title = stringResource(R.string.files_copy_relative_path),
                        onClick = it,
                        icon = painterResource(DesignR.drawable.ic_content_copy)
                    )
                }
            }
        }
    }
}

/** A file row's icon column: 24 dp wide, 12 dp from the name. */
internal val FileIconSlot = ListLeadingSlot(width = 24.dp, spacing = 12.dp)

internal val FolderIcon = DesignR.drawable.ic_folder_fill
internal val FileIcon = DesignR.drawable.ic_description
private const val IGNORED_ALPHA = 0.5f
