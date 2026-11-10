package cx.lpm.mobile.feature.automations.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.feature.automations.R as AutomationsR

/**
 * The page's one action — stop the run, start one, or turn the job back on — pinned
 * under the list so it stays in reach however far the history scrolls.
 */
@Composable
fun AutomationRunBar(
    job: AutomationJob,
    pending: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    // A question waiting for its answer holds the next run back.
    val waiting = job.held && !job.running && job.enabled
    val enabled = !pending && !(job.enabled && !job.valid) && !waiting
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val container = when {
        !enabled -> colors.tertiarySystemFill
        job.running -> colors.red
        else -> colors.tint
    }
    val content = if (enabled) Color.White else colors.tertiaryLabel
    Box(
        modifier
            .fillMaxWidth()
            .background(
                colors.secondarySystemGroupedBackground.copy(alpha = BAR_ALPHA)
                    .compositeOver(colors.systemGroupedBackground)
            )
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 6.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = 50.dp)
                .alpha(if (pressed) 0.75f else 1f)
                .clip(CircleShape)
                .background(container)
                .clickable(
                    interactionSource = interaction,
                    indication = null,
                    enabled = enabled,
                    role = Role.Button,
                    onClick = onClick
                )
                .padding(horizontal = 20.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (pending) {
                ActivityIndicator(size = ActivityIndicatorSize.Small, color = Color.White)
            } else {
                Icon(
                    painter = painterResource(
                        when {
                            job.running -> R.drawable.ic_stop_fill
                            job.enabled -> R.drawable.ic_play_arrow_fill
                            else -> R.drawable.ic_power_settings_new
                        }
                    ),
                    contentDescription = null,
                    tint = content,
                    modifier = Modifier.size(22.dp)
                )
            }
            Text(
                text = runTitle(job),
                style = LpmTheme.typography.body.copy(fontWeight = FontWeight.SemiBold),
                color = content
            )
        }
    }
}

@Composable
private fun runTitle(job: AutomationJob): String = when {
    job.running && job.runningCount > 1 ->
        pluralStringResource(AutomationsR.plurals.run_stop_many, job.runningCount, job.runningCount)

    job.running -> stringResource(AutomationsR.string.run_stop)

    !job.enabled -> stringResource(AutomationsR.string.run_turn_on)

    job.runsIn.size > 1 ->
        pluralStringResource(AutomationsR.plurals.run_in_projects, job.runsIn.size, job.runsIn.size)

    else -> stringResource(AutomationsR.string.run_now)
}

/** iOS's `.bar` material over the list's ground, with nothing scrolled beneath it. */
private const val BAR_ALPHA = 0.6f
