package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.AlertButton
import cx.lpm.mobile.core.designsystem.component.AlertRole
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.LpmConfirmationDialog
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.core.designsystem.component.ProminentButtonSize
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitConflictOp
import cx.lpm.mobile.core.model.GitMergeState
import cx.lpm.mobile.feature.git.R

/**
 * The desktop Merge dialog's conflicts panel, above the changes while a merge, a pull
 * or a rebase left conflicts: each file and how many it has left, AI to work through
 * them, and the merge to commit or undo.
 */
@Composable
internal fun MergeConflictsCard(
    row: ReviewRow.MergeConflicts,
    actions: ReviewActions,
    modifier: Modifier = Modifier
) {
    val merge = row.merge
    Column(
        modifier
            .fillMaxWidth()
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp)
            .background(LpmTheme.colors.secondarySystemBackground, RoundedCornerShape(14.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Header(merge, row.branch)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            merge.files.forEach { file ->
                MergeConflictRow(
                    file = file,
                    side = row.sides[file.path],
                    busy = row.busyPath == file.path,
                    locked = row.locked,
                    onOpen = { actions.openConflict(file) },
                    onAction = actions.runConflictOp
                )
            }
        }
        Buttons(row, actions)
        // Last, so nothing takes Stop's place under the finger.
        row.resolving?.let { line ->
            ProgressLine(
                line = line,
                enabled = row.op == null && !row.away,
                onStop = { actions.runConflictOp(GitConflictOp.Stop) }
            )
        }
    }
}

@Composable
private fun Header(merge: GitMergeState, branch: String) {
    val colors = LpmTheme.colors
    val total = merge.files.size
    val done = total - merge.remaining
    Column(
        Modifier.semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text(
            text = when {
                merge.source.isEmpty() -> stringResource(R.string.git_merge_conflicts)
                branch.isEmpty() -> stringResource(R.string.git_merging, merge.source)
                else -> stringResource(R.string.git_merging_into, merge.source, branch)
            },
            style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
            color = colors.label
        )
        Text(
            text = pluralStringResource(R.plurals.git_merge_resolved, total, done, total),
            style = LpmTheme.typography.footnote.copy(fontFeatureSettings = "tnum"),
            color = colors.secondaryLabel
        )
        ReviewProgressBar(done, total)
    }
}

@Composable
private fun Buttons(row: ReviewRow.MergeConflicts, actions: ReviewActions) {
    val merge = row.merge
    val colors = LpmTheme.colors
    val haptics = LocalHapticFeedback.current
    var confirmingAbort by remember { mutableStateOf(false) }
    val run = { op: GitConflictOp ->
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        actions.runConflictOp(op)
    }
    if (merge.remaining > 0 || row.resolving != null) {
        ProminentButton(
            text = if (row.resolving == null) {
                stringResource(R.string.git_merge_resolve, merge.remaining.toString())
            } else {
                stringResource(R.string.git_merge_resolving)
            },
            onClick = { run(GitConflictOp.Resolve) },
            size = ProminentButtonSize.Regular,
            enabled = !row.locked,
            busy = row.op == GitConflictOp.Resolve
        )
    }
    if (merge.merging) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ProminentButton(
                text = stringResource(R.string.git_merge_abort),
                onClick = { confirmingAbort = true },
                containerColor = colors.red.copy(alpha = 0.15f),
                contentColor = colors.red,
                size = ProminentButtonSize.Regular,
                enabled = !row.locked,
                busy = row.op == GitConflictOp.Abort,
                modifier = Modifier.weight(1f)
            )
            ProminentButton(
                text = stringResource(R.string.git_merge_continue),
                onClick = { run(GitConflictOp.Commit(merge.source)) },
                containerColor = colors.green,
                size = ProminentButtonSize.Regular,
                enabled = !row.locked && merge.remaining == 0,
                busy = row.op is GitConflictOp.Commit,
                modifier = Modifier.weight(1f)
            )
        }
    }
    if (confirmingAbort) {
        LpmConfirmationDialog(
            title = stringResource(R.string.git_merge_abort_title),
            message = stringResource(R.string.git_merge_abort_message),
            buttons = listOf(
                AlertButton(
                    stringResource(R.string.git_merge_abort_confirm),
                    AlertRole.Destructive
                ) {
                    haptics.performHapticFeedback(HapticFeedbackType.Reject)
                    actions.abortMerge()
                }
            ),
            onDismissRequest = { confirmingAbort = false }
        )
    }
}

/** What the AI is doing, with Stop. */
@Composable
private fun ProgressLine(line: String, enabled: Boolean, onStop: () -> Unit) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        ActivityIndicator(size = ActivityIndicatorSize.Small)
        Text(
            text = line.ifEmpty { stringResource(R.string.git_merge_starting) },
            modifier = Modifier.weight(1f),
            style = LpmTheme.typography.footnote,
            color = LpmTheme.colors.secondaryLabel,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        CapsuleButton(
            text = stringResource(R.string.git_merge_stop),
            onClick = onStop,
            enabled = enabled
        )
    }
}
