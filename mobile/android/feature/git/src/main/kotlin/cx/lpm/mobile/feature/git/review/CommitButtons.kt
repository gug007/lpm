package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R

/**
 * The commit sheet's bottom (iOS `CommitButtons`): "Commit and Push" across the
 * width, "Commit only" under it. Both wait while either runs, and the one tapped
 * shows its progress.
 */
@Composable
internal fun CommitButtons(
    busy: CommitBusy?,
    enabled: Boolean,
    onCommitAndPush: () -> Unit,
    onCommitOnly: () -> Unit,
    modifier: Modifier = Modifier
) {
    val pushLabel = when (busy) {
        CommitBusy.Checking -> R.string.git_commit_checking
        CommitBusy.Committing -> R.string.git_commit_committing
        CommitBusy.Pushing -> R.string.git_commit_pushing
        else -> R.string.git_commit_and_push
    }
    Column(
        modifier.bottomBar(),
        verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        ProminentButton(
            text = stringResource(pushLabel),
            icon = painterResource(DesignR.drawable.ic_arrow_upward),
            busy =
                busy == CommitBusy.Checking || busy == CommitBusy.Committing ||
                    busy == CommitBusy.Pushing,
            enabled = enabled,
            onClick = onCommitAndPush
        )
        CommitOnlyButton(busy, enabled, onCommitOnly)
    }
}

/** A plain text button across the width, iOS's `.borderless`. */
@Composable
private fun CommitOnlyButton(busy: CommitBusy?, enabled: Boolean, onClick: () -> Unit) {
    val running = busy == CommitBusy.CommittingOnly || busy == CommitBusy.CheckingOnly
    val colors = LpmTheme.colors
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .alpha(if (pressed) 0.3f else 1f)
            .clickable(
                interactionSource = interaction,
                indication = null,
                enabled = enabled,
                role = Role.Button,
                onClick = onClick
            ),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically
    ) {
        if (running) ActivityIndicator(size = ActivityIndicatorSize.Small)
        Text(
            text = stringResource(
                when (busy) {
                    CommitBusy.CheckingOnly -> R.string.git_commit_checking
                    CommitBusy.CommittingOnly -> R.string.git_commit_committing
                    else -> R.string.git_commit_only
                }
            ),
            style = LpmTheme.typography.body,
            color = if (enabled) colors.tint else colors.tertiaryLabel
        )
    }
}
