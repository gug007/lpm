package cx.lpm.mobile.core.ui.dictation

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.data.dictation.DictationFailure
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationPhase
import cx.lpm.mobile.core.data.dictation.DictationState
import cx.lpm.mobile.core.data.dictation.dictationNow
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.ui.R
import kotlinx.coroutines.delay

private val Bar = 2.5.dp
private val Step = 4.5.dp
private const val SAMPLE_MS = 70L
private const val CLOCK_TICK_MS = 250L
private const val MAX_SAMPLES = 120
private const val FADE_STOP = 0.12f
private const val RISE = 0.55f
private const val FALL = 0.18f
private const val BAR_ALPHA = 0.85f
private const val CLOCK_ALPHA = 0.6f
private const val MILLIS_PER_SECOND = 1_000L
private const val SECONDS_PER_MINUTE = 60L

/**
 * The recorder in place of a field or a composer's controls: the level trace and the
 * clock during a take, and what went wrong after a failed one.
 */
@Composable
fun DictationStrip(
    state: DictationState,
    owner: String,
    meter: DictationMeter,
    ink: Color,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val failure = state.failure(owner)
    if (failure != null) {
        DictationNotice(failure, ink, onRetry, modifier)
        return
    }
    val label = stringResource(
        if (state.isTranscribing) {
            R.string.ui_dictation_transcribing
        } else {
            R.string.ui_dictation_recording
        }
    )
    Row(
        modifier.clearAndSetSemantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        DictationTrace(meter, ink, frozen = state.isTranscribing, Modifier.weight(1f))
        DictationClock(state, ink.copy(alpha = CLOCK_ALPHA))
    }
}

/**
 * The field as it will read at Stop: the draft, then what the take has heard so far.
 * Past [maxHeight] the newest words are the ones that stay in sight.
 */
@Composable
fun DictationPreview(text: String, style: TextStyle, maxHeight: Dp, modifier: Modifier = Modifier) {
    Text(
        text = text,
        style = style,
        modifier = modifier
            .heightIn(max = maxHeight)
            .clipToBounds()
            .wrapContentHeight(Alignment.Bottom, unbounded = true)
    )
}

@Composable
private fun DictationNotice(
    failure: DictationFailure,
    ink: Color,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    Row(
        modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = failure.text(),
            color = ink,
            fontSize = 12.sp,
            lineHeight = 15.sp,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f)
        )
        if (failure.canRetry) {
            NoticeAction(R.string.ui_dictation_record_again, ink, onRetry)
        } else if (failure == DictationFailure.Denied) {
            NoticeAction(R.string.ui_dictation_open_settings, ink) { context.openAppSettings() }
        }
    }
}

@Composable
private fun NoticeAction(title: Int, ink: Color, onClick: () -> Unit) {
    Text(
        text = stringResource(title),
        color = ink,
        fontSize = 12.sp,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.clickableNoIndication(onClick = onClick)
    )
}

@Composable
private fun DictationFailure.text(): String = when (this) {
    DictationFailure.NoSpeech -> stringResource(R.string.ui_dictation_no_speech)
    DictationFailure.Denied -> stringResource(R.string.ui_dictation_denied)
    DictationFailure.Unavailable -> stringResource(R.string.ui_dictation_unavailable)
    is DictationFailure.Computer -> message
}

private fun Context.openAppSettings() {
    startActivity(
        Intent(
            Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
            Uri.fromParts("package", packageName, null)
        )
    )
}

/** How long the take has run: counts while recording, then holds its length. */
@Composable
private fun DictationClock(state: DictationState, color: Color) {
    val startedAt = state.startedAt.takeIf { state.phase == DictationPhase.Recording }
    var elapsed by remember { mutableLongStateOf(0L) }
    LaunchedEffect(startedAt) {
        while (startedAt != null) {
            elapsed = dictationNow() - startedAt
            delay(CLOCK_TICK_MS)
        }
    }
    val seconds = (if (startedAt != null) elapsed else state.lengthMs) / MILLIS_PER_SECOND
    Text(
        text = "%d:%02d".format(seconds / SECONDS_PER_MINUTE, seconds % SECONDS_PER_MINUTE),
        color = color,
        fontSize = 13.sp,
        modifier = Modifier.widthIn(min = 30.dp)
    )
}

/**
 * The level trace, as if leaving a tape head at the right: silence is a dotted line
 * and speech rises into bars. It stops where the recording ended.
 */
@Composable
private fun DictationTrace(
    meter: DictationMeter,
    ink: Color,
    frozen: Boolean,
    modifier: Modifier = Modifier
) {
    val samples = remember { mutableStateListOf<Float>() }
    LaunchedEffect(frozen) {
        var shown = samples.lastOrNull() ?: 0f
        while (!frozen) {
            val level = meter.level
            // Quick to rise, slower to fall, like a VU meter.
            shown += (level - shown) * (if (level > shown) RISE else FALL)
            samples.add(shown)
            if (samples.size > MAX_SAMPLES) samples.removeAt(0)
            delay(SAMPLE_MS)
        }
    }
    Canvas(
        modifier
            .height(22.dp)
            .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
            .semantics { }
    ) {
        val bar = Bar.toPx()
        val step = Step.toPx()
        val color = ink.copy(alpha = BAR_ALPHA)
        var x = size.width - bar
        for (i in samples.indices.reversed()) {
            if (x <= -bar) break
            val height = maxOf(bar, samples[i] * size.height)
            drawRoundRect(
                color = color,
                topLeft = Offset(x, (size.height - height) / 2),
                size = Size(bar, height),
                cornerRadius = CornerRadius(bar / 2)
            )
            x -= step
        }
        drawRect(
            brush = Brush.horizontalGradient(
                0f to Color.Transparent,
                FADE_STOP to Color.Black
            ),
            blendMode = BlendMode.DstIn
        )
    }
}
