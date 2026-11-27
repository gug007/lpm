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
import cx.lpm.mobile.core.model.waitText
import cx.lpm.mobile.feature.projects.R
import kotlinx.coroutines.delay

/** What the sheet's merge section does. */
internal class CiMergeActions(
    val merge: (GitMergeMethod, deleteBranch: Boolean) -> Unit = { _, _ -> },
    /** Merges now, past the base branch's rules. */
    val bypass: (GitMergeMethod, deleteBranch: Boolean) -> Unit = { _, _ -> },
    val mergeWhenReady: (GitMergeMethod, deleteBranch: Boolean, bypass: Boolean) -> Unit =
        { _, _, _ -> },
    val cancelWhenReady: () -> Unit = {},
    val pickMethod: (GitMergeMethod) -> Unit = {},
    val reload: () -> Unit = {}
)

/**
 * The CI sheet's last step (iOS `GitMergeSection`): merging the branch's open pull
 * request once GitHub says it can go, with a method the repository allows and its
 * branch deleted on GitHub, or once its running checks pass, or past the rules holding
 * it back. The Mac's working copy stays as it is.
 */
@Composable
internal fun GitMergeSection(state: GitChecksUiState, checks: GitChecks, actions: CiMergeActions) {
    var deleteBranch by remember { mutableStateOf(true) }
    val pr = checks.pr ?: return
    val status = checks.mergeStatus
    if (!state.canMerge || state.merged != null || status == null) return
    val offer = pr.merge ?: return
    val reload by rememberUpdatedState(actions.reload)
    LaunchedEffect(status) {
        if (status != GitMergeStatus.Checking) return@LaunchedEffect
        delay(RECHECK_MS)
        reload()
    }
    val colors = LpmTheme.colors
    val ready = status is GitMergeStatus.Ready
    val waits = status == GitMergeStatus.WaitingForChecks && state.canMergeWhenReady
    val bypassable = state.canMergeWhenReady && offer.bypassable &&
        (status is GitMergeStatus.Blocked || status == GitMergeStatus.WaitingForChecks)
    val armed = checks.mergeWatch?.takeIf { it.waiting && it.number == pr.number }
    val error = state.mergeError
    val footer = when {
        error != null -> error
        armed != null -> null
        ready && offer.deletesBranch -> stringResource(R.string.ci_merge_deletes_branch)
        waits -> checks.waitText(bypass = offer.bypassable)
        bypassable -> stringResource(R.string.ci_merge_bypass_footer, offer.baseName, pr.site)
        else -> null
    }
    ListSection(
        footer = footer,
        footerColor = if (error != null) colors.red else colors.secondaryLabel
    ) {
        if (armed != null) {
            ArmedMergeRow(armed.armedText(offer.baseName, pr.site))
            CancelMergeButton(busy = state.arming, onClick = actions.cancelWhenReady)
            return@ListSection
        }
        MergeStatusRow(status)
        if (!ready && !waits && !bypassable) return@ListSection
        val methods = offer.methods
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
        if (!offer.deletesBranch) {
            ToggleRow(
                title = stringResource(R.string.ci_merge_delete_branch),
                checked = deleteBranch,
                onCheckedChange = { deleteBranch = it }
            )
        }
        val haptics = LocalHapticFeedback.current
        val confirmRisky = LocalConfirmRisky.current
        val deletes = offer.deletesBranch || deleteBranch
        val tapThenConfirm = { reason: String, action: () -> Unit ->
            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
            confirmRisky.confirm(reason, action)
        }
        if (ready) {
            ProminentButton(
                text = stringResource(R.string.ci_merge_button, pr.ref),
                onClick = {
                    tapThenConfirm("Merge ${pr.noun} ${pr.ref}") { actions.merge(method, deletes) }
                },
                modifier = ButtonPadding,
                busy = state.merging,
                enabled = !state.merging,
                containerColor = colors.green
            )
        }
        if (waits) {
            ProminentButton(
                text = stringResource(R.string.ci_merge_when_ready),
                onClick = {
                    tapThenConfirm("Merge ${pr.noun} ${pr.ref} when checks pass") {
                        actions.mergeWhenReady(method, deletes, offer.bypassable)
                    }
                },
                modifier = ButtonPadding,
                busy = state.arming,
                enabled = !state.arming && !state.merging,
                containerColor = colors.green
            )
        }
        if (bypassable) {
            ProminentButton(
                text = stringResource(R.string.ci_merge_bypass),
                onClick = {
                    tapThenConfirm("Bypass the rules and merge ${pr.noun} ${pr.ref}") {
                        actions.bypass(method, deletes)
                    }
                },
                modifier = ButtonPadding,
                busy = state.merging,
                enabled = !state.merging && !state.arming,
                containerColor = colors.red.copy(alpha = BORDERED_TINT_ALPHA),
                contentColor = colors.red,
                spinnerColor = colors.gray
            )
        }
    }
}

/** Cancel Merge: stops the Mac's wait (`.bordered`). */
@Composable
private fun CancelMergeButton(busy: Boolean, onClick: () -> Unit) {
    val colors = LpmTheme.colors
    val haptics = LocalHapticFeedback.current
    ProminentButton(
        text = stringResource(R.string.ci_merge_cancel),
        onClick = {
            haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
            onClick()
        },
        modifier = ButtonPadding,
        busy = busy,
        enabled = !busy,
        containerColor = colors.secondarySystemFill,
        contentColor = colors.tint,
        spinnerColor = colors.gray
    )
}

/**
 * The CI sheet while the Mac waits to merge once the checks pass: what it will do (the
 * desktop's PR card while armed).
 */
@Composable
private fun ArmedMergeRow(text: String) {
    MergeRow(
        title = stringResource(R.string.ci_merge_armed),
        detail = text,
        leading = { StatusIcon(DesignR.drawable.ic_schedule, LpmTheme.colors.orange) }
    )
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
        footer = if (merged.deletedBranch) {
            stringResource(R.string.ci_merged_branch_deleted, merged.site)
        } else {
            stringResource(R.string.ci_merged_branch_kept)
        }
    ) {
        MergeRow(
            title = stringResource(R.string.ci_merged, merged.ref),
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
private val ButtonPadding = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
private const val BORDERED_TINT_ALPHA = 0.15f
private const val RECHECK_MS = 3_000L
