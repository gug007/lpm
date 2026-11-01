package cx.lpm.mobile.feature.projects.list

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalWindowInfo
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.link.LinkStatusLine
import cx.lpm.mobile.core.designsystem.R
import cx.lpm.mobile.core.designsystem.component.StatusDot
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.projects.R as ProjectsR
import cx.lpm.mobile.feature.projects.ui.SymbolGlyph

/**
 * The projects list's title: the active Mac's name (the Mac picker) with a line
 * under it saying how the phone is connected. Tapping the line opens the
 * connection details.
 */
@Composable
fun MacTitle(
    state: MacTitleState,
    macs: List<MacChoice>,
    demoMode: Boolean,
    actions: MacSwitcherActions,
    modifier: Modifier = Modifier
) {
    var menuOpen by remember { mutableStateOf(false) }
    // Room kept free on each side for the bar's button: a title wider than the
    // space between would be slid off center, out of line with the status.
    val screen = with(LocalDensity.current) { LocalWindowInfo.current.containerSize.width.toDp() }
    Column(
        modifier = modifier.widthIn(max = (screen - BarItemInset * 2).coerceAtLeast(0.dp)),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(1.dp)
    ) {
        Row(
            modifier = Modifier.clickableNoIndication({ menuOpen = true }),
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = state.name,
                style = LpmTheme.typography.headline,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f, fill = false)
            )
            actions.keepAwakeIndicator()
            SymbolGlyph(
                painter = painterResource(R.drawable.ic_keyboard_arrow_down),
                size = 22.dp,
                bounds = DpSize(12.dp, 7.dp),
                tint = LpmTheme.colors.secondaryLabel
            )
            MacSwitcherMenu(
                expanded = menuOpen,
                onDismiss = { menuOpen = false },
                macs = macs,
                demoMode = demoMode,
                actions = actions,
                showAllMachines = state.showAllMachines
            )
        }
        val text = when (val detail = state.detail) {
            is MacTitleDetail.Waiting -> stringResource(
                ProjectsR.string.mac_status_detail,
                state.status.text,
                pluralStringResource(ProjectsR.plurals.mac_waiting, detail.count, detail.count)
            )

            MacTitleDetail.Details -> stringResource(
                ProjectsR.string.mac_status_detail,
                state.status.text,
                stringResource(ProjectsR.string.mac_details)
            )

            null -> state.status.text
        }
        val hint = stringResource(ProjectsR.string.mac_status_hint)
        LinkStatusLabel(
            line = state.status,
            text = text,
            modifier = Modifier
                .alpha(if (state.opensDetails) 1f else DISABLED_ALPHA)
                .clickableNoIndication(
                    actions.showDetails,
                    enabled = state.opensDetails,
                    onClickLabel = hint
                )
        )
    }
}

/** A status dot and the status words, pulsing while connecting. */
@Composable
fun LinkStatusLabel(line: LinkStatusLine, text: String, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val tint = when (line.tone) {
        LinkStatusLine.Tone.Live -> colors.green
        LinkStatusLine.Tone.Waiting -> colors.orange
        LinkStatusLine.Tone.Problem -> colors.red
    }
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        val pulse = if (line.pulse) pulseAlpha() else null
        StatusDot(
            color = tint,
            size = 6.dp,
            modifier = Modifier.graphicsLayer { alpha = pulse?.invoke() ?: 1f }
        )
        Text(
            text = text,
            style = LpmTheme.typography.caption2.copy(fontWeight = FontWeight.Medium),
            color = colors.secondaryLabel,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun pulseAlpha(): () -> Float {
    val transition = rememberInfiniteTransition(label = "status")
    val alpha = transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.3f,
        animationSpec = infiniteRepeatable(tween(PULSE_MS), RepeatMode.Reverse),
        label = "alpha"
    )
    return { alpha.value }
}

private val BarItemInset = 72.dp
private const val DISABLED_ALPHA = 0.5f
private const val PULSE_MS = 800
