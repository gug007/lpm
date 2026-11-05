package cx.lpm.mobile.feature.git.review

import android.content.ClipData
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.ClipEntry
import androidx.compose.ui.platform.LocalClipboard
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuDivider
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.GitStatusBadge
import cx.lpm.mobile.feature.git.R
import kotlinx.coroutines.launch

/**
 * A file's bar, pinned over its diff while the diff scrolls (GitHub "Files changed"
 * style): the collapse chevron, status letter, name over folder with +N −M, the
 * "Wrap" and "Viewed" toggles, and "…" with "Ask agent…", include or exclude, "Copy
 * Path" and, when the Mac can ([canDiscard]), "Discard Changes…" — also on a long
 * press.
 */
@Composable
internal fun FileHeaderBar(
    row: ReviewRow.FileHeader,
    wrap: Boolean,
    actions: ReviewActions,
    onViewedToggle: () -> Unit,
    modifier: Modifier = Modifier,
    canDiscard: Boolean = false,
    discarding: Boolean = false
) {
    val colors = LpmTheme.colors
    var menu by remember { mutableStateOf(false) }
    var confirmingDiscard by remember { mutableStateOf(false) }
    val clipboard = LocalClipboard.current
    val scope = rememberCoroutineScope()
    val path = row.path
    Box(modifier) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = HeaderMinHeight)
                .background(colors.secondarySystemBackground)
                .padding(start = 12.dp, end = 6.dp, top = 8.dp, bottom = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            NameButton(
                row = row,
                onClick = { actions.toggleCollapsed(path) },
                onLongClick = { menu = true },
                modifier = Modifier.weight(1f)
            )
            // Long diff lines wrap to the screen (the default) or scroll sideways,
            // one choice for every file.
            TogglePill(
                on = wrap,
                onToggle = actions.toggleWrap,
                label = stringResource(R.string.git_file_wrap),
                tint = colors.tint,
                role = Role.Switch
            )
            TogglePill(
                on = row.viewed,
                onToggle = onViewedToggle,
                label = stringResource(R.string.git_file_viewed),
                tint = colors.green,
                role = Role.Checkbox,
                icon = if (row.viewed) {
                    DesignR.drawable.ic_check_circle_fill
                } else {
                    DesignR.drawable.ic_circle
                }
            )
            Box(
                modifier = Modifier
                    .size(32.dp)
                    .clickableNoIndication(onClick = { menu = true }),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_more_horiz),
                    contentDescription = stringResource(R.string.git_more),
                    tint = colors.secondaryLabel,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
        HorizontalDivider(
            modifier = Modifier.align(Alignment.BottomStart),
            thickness = Dp.Hairline,
            color = colors.separator
        )
        ContextMenu(expanded = menu, onDismissRequest = { menu = false }) {
            ContextMenuItem(
                title = stringResource(R.string.git_file_ask_agent),
                onClick = { actions.ask(path) },
                icon = painterResource(DesignR.drawable.ic_auto_awesome)
            )
            ContextMenuItem(
                title = stringResource(
                    if (row.selected) {
                        R.string.git_file_exclude_from_commit
                    } else {
                        R.string.git_file_include_in_commit
                    }
                ),
                onClick = { actions.toggleSelected(path) },
                icon = painterResource(if (row.selected) EXCLUDE_ICON else INCLUDE_ICON)
            )
            ContextMenuItem(
                title = stringResource(R.string.git_file_copy_path),
                onClick = {
                    val clip = ClipEntry(ClipData.newPlainText(null, path))
                    scope.launch { clipboard.setClipEntry(clip) }
                },
                icon = painterResource(DesignR.drawable.ic_content_copy)
            )
            if (canDiscard) {
                ContextMenuDivider()
                ContextMenuItem(
                    title = stringResource(R.string.git_file_discard),
                    onClick = { confirmingDiscard = true },
                    icon = painterResource(DesignR.drawable.ic_delete),
                    destructive = true,
                    enabled = !discarding
                )
            }
        }
    }
    if (confirmingDiscard) {
        DiscardConfirmation(
            row = row,
            onDiscard = { actions.discardFile(path) },
            onDismiss = { confirmingDiscard = false }
        )
    }
}

/** "Discard changes to <name>?": the file goes back to the last commit, and can be undone. */
@Composable
private fun DiscardConfirmation(
    row: ReviewRow.FileHeader,
    onDiscard: () -> Unit,
    onDismiss: () -> Unit
) {
    val haptics = LocalHapticFeedback.current
    LpmConfirmationDialog(
        title = stringResource(R.string.git_file_discard_title, row.file.name),
        message = stringResource(R.string.git_file_discard_message, row.path),
        buttons = listOf(
            AlertButton(stringResource(R.string.git_file_discard_confirm), AlertRole.Destructive) {
                haptics.performHapticFeedback(HapticFeedbackType.Reject)
                onDiscard()
            }
        ),
        onDismissRequest = onDismiss
    )
}

/** The chevron, status and name that collapse the diff, read out as the file's path. */
@Composable
private fun NameButton(
    row: ReviewRow.FileHeader,
    onClick: () -> Unit,
    onLongClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val state = stringResource(
        if (row.collapsed) R.string.git_file_collapsed else R.string.git_file_expanded
    )
    val turn by animateFloatAsState(if (row.collapsed) -90f else 0f, tween(150), label = "chevron")
    Row(
        modifier = modifier
            .combinedClickable(
                interactionSource = null,
                indication = null,
                role = Role.Button,
                onLongClick = onLongClick,
                onClick = onClick
            )
            .semantics(mergeDescendants = true) {
                contentDescription = row.path
                stateDescription = state
            },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.width(14.dp), contentAlignment = Alignment.Center) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_keyboard_arrow_down),
                contentDescription = null,
                tint = colors.secondaryLabel,
                modifier = Modifier
                    .size(20.dp)
                    .rotate(turn)
            )
        }
        GitStatusBadge(row.file.status)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = row.file.name,
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = colors.label,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis
            )
            DetailLine(row)
        }
    }
}

/** The folder, the change counts once parsed, and "Excluded" when left out of the commit. */
@Composable
private fun DetailLine(row: ReviewRow.FileHeader) {
    val colors = LpmTheme.colors
    val style = LpmTheme.typography.caption1
    Row(
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val directory = row.file.directory
        if (directory.isNotEmpty()) {
            Text(
                text = directory,
                style = style,
                color = colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.StartEllipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
        }
        if (row.added != null && row.removed != null) {
            DiffStat(row.added, row.removed)
        }
        if (!row.selected) {
            Text(
                text = stringResource(R.string.git_file_excluded),
                style = style,
                color = colors.orange,
                maxLines = 1
            )
        }
    }
}

/** The per-file "+N −M", each only when nonzero. */
@Composable
internal fun DiffStat(added: Int, removed: Int, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val style = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold
    )
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (added > 0) {
            Text(
                stringResource(R.string.git_review_added, added),
                style = style,
                color = colors.green,
                maxLines = 1
            )
        }
        if (removed > 0) {
            Text(
                stringResource(R.string.git_review_removed, removed),
                style = style,
                color = colors.red,
                maxLines = 1
            )
        }
    }
}

private val EXCLUDE_ICON = DesignR.drawable.ic_do_not_disturb_on
private val INCLUDE_ICON = DesignR.drawable.ic_add_circle
private val HeaderMinHeight = 56.dp
