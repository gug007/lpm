package cx.lpm.mobile.feature.projects.ci

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.progressBarRangeInfo
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.component.ListSection
import cx.lpm.mobile.core.designsystem.component.ToggleRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CiFixLoop
import cx.lpm.mobile.feature.projects.R

/**
 * The CI sheet's Keep fixing until green (iOS `CiFixLoopSection`): a switch that makes
 * the next Fix with … row follow its agent until the checks pass, and while a loop
 * runs, its round, where it stands and a Stop button. Once one has ended and nothing
 * fails, how it went.
 */
@Composable
internal fun CiFixLoopSection(
    loop: CiFixLoop?,
    error: String?,
    canFix: Boolean,
    keepFixing: Boolean,
    onKeepFixing: (Boolean) -> Unit,
    onStop: () -> Unit
) {
    val running = loop?.takeIf { it.running }
    val ended = loop?.takeIf { !it.running && it.state != "cancelled" }
    val haptics = LocalHapticFeedback.current
    val stop = {
        haptics.performHapticFeedback(HapticFeedbackType.ContextClick)
        onStop()
    }
    if (running == null && !canFix) {
        ended?.let { EndedRow(it) }
        return
    }
    val footer = when {
        error != null -> error
        running != null || keepFixing -> stringResource(R.string.ci_keep_fixing_footer)
        else -> ended?.detail?.takeIf { it.isNotEmpty() }
    }
    val footerColor = if (error != null) LpmTheme.colors.red else LpmTheme.colors.secondaryLabel
    ListSection(footer = footer, footerColor = footerColor) {
        val title = stringResource(R.string.ci_keep_fixing)
        ToggleRow(
            title = title,
            checked = running != null || keepFixing,
            onCheckedChange = { on ->
                if (!on && running != null) stop()
                onKeepFixing(on)
            },
            onClick = {
                if (running != null) stop()
                onKeepFixing(!(running != null || keepFixing))
            },
            leading = { LoopIcon() }
        )
        running?.let { RunningRow(it, onStop = stop) }
    }
}

@Composable
private fun LoopIcon() {
    Icon(
        painterResource(DesignR.drawable.ic_repeat),
        contentDescription = null,
        tint = LpmTheme.colors.tint,
        modifier = Modifier.size(22.dp)
    )
}

@Composable
private fun RunningRow(loop: CiFixLoop, onStop: () -> Unit) {
    val colors = LpmTheme.colors
    ListRow(
        trailing = {
            CapsuleButton(
                text = stringResource(R.string.ci_keep_fixing_stop),
                onClick = onStop,
                textStyle = LpmTheme.typography.subheadline
            )
        }
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                loop.roundLabel,
                style = LpmTheme.typography.subheadline,
                fontWeight = FontWeight.SemiBold,
                color = colors.label
            )
            Text(
                loop.detail,
                style = LpmTheme.typography.footnote,
                color = colors.secondaryLabel,
                maxLines = 2
            )
            Spacer(Modifier.height(6.dp))
            LoopProgress(loop.progress.toFloat(), colors.systemFill, colors.tint)
        }
        Spacer(Modifier.width(12.dp))
    }
}

@Composable
private fun EndedRow(loop: CiFixLoop) {
    val colors = LpmTheme.colors
    val passed = loop.state == "passed"
    ListSection {
        ListRow(
            leading = {
                Icon(
                    painterResource(
                        if (passed) {
                            DesignR.drawable.ic_check_circle_fill
                        } else {
                            DesignR.drawable.ic_error
                        }
                    ),
                    contentDescription = null,
                    tint = if (passed) colors.green else colors.orange,
                    modifier = Modifier.size(22.dp)
                )
            }
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    stringResource(R.string.ci_keep_fixing),
                    style = LpmTheme.typography.body,
                    color = colors.label
                )
                Text(
                    loop.detail,
                    style = LpmTheme.typography.footnote,
                    color = colors.secondaryLabel
                )
            }
        }
    }
}

/** iOS's linear `ProgressView`: a thin rounded track filling in the tint. */
@Composable
private fun LoopProgress(fraction: Float, track: Color, fill: Color) {
    val value = fraction.coerceIn(0f, 1f)
    Canvas(
        Modifier
            .fillMaxWidth()
            .padding(top = 2.dp)
            .height(4.dp)
            .semantics { progressBarRangeInfo = ProgressBarRangeInfo(value, 0f..1f) }
    ) {
        val radius = CornerRadius(size.height / 2)
        drawRoundRect(track, cornerRadius = radius)
        if (value > 0f) {
            drawRoundRect(
                fill,
                size = Size(maxOf(size.width * value, size.height), size.height),
                cornerRadius = radius
            )
        }
    }
}
