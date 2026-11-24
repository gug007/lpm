package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ContextMenu
import cx.lpm.mobile.core.designsystem.component.ContextMenuItem
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitConflictFile
import cx.lpm.mobile.core.model.GitConflictOp
import cx.lpm.mobile.core.model.GitConflictSide
import cx.lpm.mobile.feature.git.R

/**
 * One conflicted file: how it stands, opening at its first conflict, with the desktop
 * row's actions in its menu.
 */
@Composable
internal fun MergeConflictRow(
    file: GitConflictFile,
    side: GitConflictSide?,
    busy: Boolean,
    locked: Boolean,
    onOpen: () -> Unit,
    onAction: (GitConflictOp) -> Unit,
    modifier: Modifier = Modifier
) {
    Row(
        modifier.fillMaxWidth().heightIn(min = 36.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Label(file, side, onOpen, Modifier.weight(1f))
        when {
            busy -> Box(Modifier.size(32.dp), contentAlignment = Alignment.Center) {
                ActivityIndicator(size = ActivityIndicatorSize.Small)
            }

            !file.resolved -> Menu(file, locked, onAction)
        }
    }
}

@Composable
private fun Label(
    file: GitConflictFile,
    side: GitConflictSide?,
    onOpen: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val state = stateLabel(file, side)
    val spoken = stringResource(R.string.git_conflict_spoken, file.path, state)
    Row(
        modifier
            .clickableNoIndication(onOpen)
            .clearAndSetSemantics { contentDescription = spoken },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            painter = painterResource(
                if (file.resolved) DesignR.drawable.ic_check_circle else DesignR.drawable.ic_error
            ),
            contentDescription = null,
            tint = if (file.resolved) colors.green else colors.red,
            modifier = Modifier.size(16.dp)
        )
        Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
            Text(
                text = file.path,
                style = LpmTheme.typography.footnote.copy(fontFamily = FontFamily.Monospace),
                color = if (file.resolved) colors.secondaryLabel else colors.label,
                maxLines = 1,
                overflow = TextOverflow.StartEllipsis
            )
            Text(
                text = state,
                style = LpmTheme.typography.caption1,
                color = colors.secondaryLabel
            )
        }
    }
}

@Composable
private fun Menu(file: GitConflictFile, locked: Boolean, onAction: (GitConflictOp) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        Box(
            Modifier
                .clickableNoIndication(onClick = { open = true }, enabled = !locked)
                .size(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_more_horiz),
                contentDescription = stringResource(
                    R.string.git_conflict_actions,
                    lastPathComponent(file.path)
                ),
                tint = LpmTheme.colors.secondaryLabel,
                modifier = Modifier.size(20.dp)
            )
        }
        ContextMenu(expanded = open, onDismissRequest = { open = false }) {
            if (file.conflicts == 0) {
                ContextMenuItem(
                    title = stringResource(R.string.git_conflict_mark_resolved),
                    onClick = { onAction(GitConflictOp.MarkResolved(file.path)) }
                )
            }
            ContextMenuItem(
                title = stringResource(R.string.git_conflict_use_ours),
                onClick = { onAction(GitConflictOp.Take(file.path, GitConflictSide.Ours)) }
            )
            ContextMenuItem(
                title = stringResource(R.string.git_conflict_use_theirs),
                onClick = { onAction(GitConflictOp.Take(file.path, GitConflictSide.Theirs)) }
            )
        }
    }
}

/** How the file stands, as the desktop's row says it. */
@Composable
private fun stateLabel(file: GitConflictFile, side: GitConflictSide?): String = when {
    file.resolved && side != null -> stringResource(R.string.git_conflict_used, side.id)
    file.resolved -> stringResource(R.string.git_conflict_resolved)
    file.conflicts == 0 -> stringResource(R.string.git_conflict_no_markers)
    else -> pluralStringResource(R.plurals.git_conflict_count, file.conflicts, file.conflicts)
}
