package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.component.ListLeadingSlot
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.LocalConfirmRisky
import cx.lpm.mobile.core.designsystem.component.PickerRow
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.core.designsystem.component.ToggleRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitMergeMethod
import cx.lpm.mobile.core.model.GitMergeStatus
import cx.lpm.mobile.core.model.MergedPullRequest
import cx.lpm.mobile.core.model.mergeStatus
import cx.lpm.mobile.feature.projects.R
import kotlinx.coroutines.delay

/** What the sheet's merge section does. */
internal class CiMergeActions(
    val merge: (GitMergeMethod, deleteBranch: Boolean) -> Unit = { _, _ -> },
    val pickMethod: (GitMergeMethod) -> Unit = {},
    val reload: () -> Unit = {}
)

/**
 * The CI sheet's last step (iOS `GitMergeSection`): merging the branch's open pull
 * request once GitHub says it can go, with a method the repository allows and its
 * branch deleted on GitHub. The Mac's working copy stays as it is.
 */
@Composable
internal fun GitMergeSection(state: GitChecksUiState, checks: GitChecks, actions: CiMergeActions) {
    var deleteBranch by remember { mutableStateOf(true) }
    val pr = checks.pr ?: return
    val status = checks.mergeStatus
    if (!state.canMerge || state.merged != null || status == null) return
    val offer = pr.merge
    val reload by rememberUpdatedState(actions.reload)
    LaunchedEffect(status) {
        if (status != GitMergeStatus.Checking) return@LaunchedEffect
        delay(RECHECK_MS)
        reload()
    }
    val colors = LpmTheme.colors
    val ready = status is GitMergeStatus.Ready
    val error = state.mergeError
    ListSection(
        footer = error ?: stringResource(R.string.ci_merge_deletes_branch).takeIf {
            ready && offer?.deletesBranch == true
        },
        footerColor = if (error != null) colors.red else colors.secondaryLabel
    ) {
        MergeStatusRow(status)
        if (!ready) return@ListSection
        val methods = offer?.methods.orEmpty()
        val method = state.selectedMethod
        if (methods.size > 1) {
            PickerRow(
                title = stringResource(R.string.ci_merge_method),
                options = methods,
                selected = method,
                onSelect = actions.pickMethod,
                optionLabel = { it.label }
            )
        }
        if (offer?.deletesBranch == false) {
            ToggleRow(
                title = stringResource(R.string.ci_merge_delete_branch),
                checked = deleteBranch,
                onCheckedChange = { deleteBranch = it }
            )
        }
        val haptics = LocalHapticFeedback.current
        val confirmRisky = LocalConfirmRisky.current
        ProminentButton(
            text = stringResource(R.string.ci_merge_button, pr.number),
            onClick = {
                haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
                val deletes = offer?.deletesBranch == true || deleteBranch
                confirmRisky.confirm("Merge pull request #${pr.number}") {
                    actions.merge(method, deletes)
                }
            },
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            busy = state.merging,
            enabled = !state.merging,
            containerColor = colors.green
        )
    }
}

/** "Ready to merge", or why it can't merge yet. */
@Composable
private fun MergeStatusRow(status: GitMergeStatus) {
    val colors = LpmTheme.colors
    val (title, detail) = when (status) {
        is GitMergeStatus.Ready -> stringResource(R.string.ci_merge_ready) to status.detail

        GitMergeStatus.Checking ->
            stringResource(R.string.ci_merge_checking) to
                stringResource(R.string.ci_merge_checking_detail)

        GitMergeStatus.WaitingForChecks ->
            stringResource(R.string.ci_merge_waiting) to
                stringResource(R.string.ci_merge_waiting_detail)

        is GitMergeStatus.Blocked -> stringResource(R.string.ci_merge_blocked) to status.detail
    }
    MergeRow(
        title = title,
        detail = detail,
        leading = {
            when (status) {
                is GitMergeStatus.Ready -> StatusIcon(DesignR.drawable.ic_merge, colors.green)

                GitMergeStatus.Checking, GitMergeStatus.WaitingForChecks ->
                    ActivityIndicator(size = ActivityIndicatorSize.Small)

                is GitMergeStatus.Blocked -> StatusIcon(DesignR.drawable.ic_warning, colors.orange)
            }
        }
    )
}

/** The pull request this phone just merged (iOS `GitMergedSection`). */
@Composable
internal fun GitMergedSection(merged: MergedPullRequest) {
    ListSection(
        footer = stringResource(
            if (merged.deletedBranch) {
                R.string.ci_merged_branch_deleted
            } else {
                R.string.ci_merged_branch_kept
            }
        )
    ) {
        MergeRow(
            title = stringResource(R.string.ci_merged, merged.number),
            detail = merged.title.takeIf { it.isNotEmpty() },
            leading = { StatusIcon(DesignR.drawable.ic_verified_fill, LpmTheme.colors.green) }
        )
    }
}

/** A bold title over a gray caption, read as one. */
@Composable
private fun MergeRow(title: String, detail: String?, leading: @Composable () -> Unit) {
    val colors = LpmTheme.colors
    ListRow(
        modifier = Modifier.semantics(mergeDescendants = true) {},
        leading = leading,
        leadingSlot = StatusSlot,
        verticalPadding = ListDefaults.RowVerticalPadding + 2.dp
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = title,
                style = LpmTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
                color = colors.label
            )
            detail?.let {
                Text(text = it, style = LpmTheme.typography.caption1, color = colors.secondaryLabel)
            }
        }
    }
}

@Composable
private fun StatusIcon(drawable: Int, tint: Color) {
    Icon(
        painter = painterResource(drawable),
        contentDescription = null,
        tint = tint,
        modifier = Modifier.size(22.dp)
    )
}

private val StatusSlot = ListLeadingSlot(width = 22.dp, spacing = 10.dp)
private const val RECHECK_MS = 3_000L
