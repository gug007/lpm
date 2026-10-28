package cx.lpm.mobile.core.ui

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import cx.lpm.mobile.core.designsystem.theme.AgentWorkingSweep
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.AgentState

/** A state's color: orange while it needs you, red for a problem, blue for work. */
val AgentState.tint: Color
    @Composable @ReadOnlyComposable
    get() = when (this) {
        AgentState.NeedsYou -> LpmTheme.colors.orange
        AgentState.Error -> LpmTheme.colors.red
        AgentState.Working, AgentState.Done -> LpmTheme.colors.blue
        AgentState.Idle -> LpmTheme.colors.secondaryLabel
    }

/**
 * A tab's name colored by what its agent is doing, as the desktop does: a sweep
 * through the working colors, an orange pulse while it needs you, red for a
 * problem, blue once done. Idle (or no agent) leaves the text alone, and an agent
 * already [seen] reads gray.
 */
@Composable
fun AgentToneText(
    text: String,
    state: AgentState?,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    seen: Boolean = false
) {
    val tone = when {
        seen -> modifier

        state == AgentState.Working -> modifier.workingSweep(sweepProgress())

        state == AgentState.NeedsYou -> {
            val alpha = pulseAlpha()
            modifier.graphicsLayer { this.alpha = alpha() }
        }

        else -> modifier
    }
    Text(
        text = text,
        modifier = tone,
        color = if (seen) {
            LpmTheme.colors.secondaryLabel
        } else {
            when (state) {
                AgentState.NeedsYou, AgentState.Error, AgentState.Done -> state.tint
                else -> Color.Unspecified
            }
        },
        style = style,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
    )
}

// A lap of the palette spans three widths; the strip holds three laps closed on its
// first color, so sliding it two laps ends where it began.
private val Strip = AgentWorkingSweep + AgentWorkingSweep + AgentWorkingSweep + AgentWorkingSweep[0]

@Composable
fun sweepProgress(): () -> Float {
    val transition = rememberInfiniteTransition(label = "sweep")
    val progress = transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            tween(SWEEP_MS, easing = CubicBezierEasing(1 / 3f, 0f, 2 / 3f, 1f)),
            RepeatMode.Restart
        ),
        label = "progress"
    )
    return { progress.value }
}

/** Fills whatever the content drew with the working gradient, slid by [progress]. */
fun Modifier.workingSweep(progress: () -> Float): Modifier =
    graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen)
        .drawWithContent {
            drawContent()
            val start = -progress() * size.width * 6
            drawRect(
                brush = Brush.linearGradient(
                    Strip,
                    start = Offset(start, 0f),
                    end = Offset(start + size.width * 9, 0f)
                ),
                blendMode = BlendMode.SrcIn
            )
        }

/** The desktop's "needs you" pulse: down to half strength and back every two seconds. */
@Composable
fun pulseAlpha(): () -> Float {
    val transition = rememberInfiniteTransition(label = "pulse")
    val alpha = transition.animateFloat(
        initialValue = 1f,
        targetValue = 0.5f,
        animationSpec = infiniteRepeatable(
            tween(PULSE_MS, easing = LinearEasing),
            RepeatMode.Reverse
        ),
        label = "alpha"
    )
    return { alpha.value }
}

private const val SWEEP_MS = 4_000
private const val PULSE_MS = 1_000
