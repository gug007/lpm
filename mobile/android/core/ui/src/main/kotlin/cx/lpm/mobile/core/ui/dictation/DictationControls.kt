package cx.lpm.mobile.core.ui.dictation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.ui.R

private val Seat = 36.dp
private val DiscSize = 32.dp

/** Keeps the mic and Send apart, so a thumb aiming for one doesn't land on the other. */
val DictationMicGap = 12.dp

/**
 * What a mic does when tapped: starts the take, asking for the microphone first when
 * the phone still has to grant it. A refusal goes to [onRefuse].
 */
@Composable
fun rememberDictationStart(
    needsMicrophone: Boolean,
    onStart: () -> Unit,
    onRefuse: () -> Unit
): () -> Unit {
    val context = LocalContext.current
    val permission =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) onStart() else onRefuse()
        }
    return {
        if (!needsMicrophone || context.hasMicrophone()) {
            onStart()
        } else {
            permission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }
}

private fun Context.hasMicrophone(): Boolean =
    ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED

/** The filled round button that stands in for Send while there's nothing to send. */
@Composable
fun DictationMicDisc(
    ground: Color,
    glyph: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    seat: Dp = Seat,
    disc: Dp = DiscSize
) {
    Disc(ground, stringResource(R.string.ui_dictate), onClick, seat, modifier, disc) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_mic),
            contentDescription = null,
            tint = glyph,
            modifier = Modifier.size(20.dp)
        )
    }
}

/** The plain mic beside Send, for adding to what's in the field. */
@Composable
fun DictationGhostMic(
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    seat: Dp = Seat
) {
    val label = stringResource(R.string.ui_dictate)
    Box(
        modifier
            .size(seat)
            .semantics { contentDescription = label }
            .clickableNoIndication(onClick = onClick, enabled = enabled),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_mic),
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(22.dp)
        )
    }
}

/** Ends a take in the seat the mic was in, or spins while its words arrive. */
@Composable
fun DictationStopButton(
    transcribing: Boolean,
    glyph: Color,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
    seat: Dp = Seat
) {
    val label = stringResource(
        if (transcribing) R.string.ui_dictation_transcribing else R.string.ui_dictation_stop
    )
    Disc(LpmTheme.colors.red, label, onStop, seat, modifier, enabled = !transcribing) {
        if (transcribing) {
            ActivityIndicator(size = ActivityIndicatorSize.Small, color = glyph)
        } else {
            Icon(
                painter = painterResource(DesignR.drawable.ic_stop_fill),
                contentDescription = null,
                tint = glyph,
                modifier = Modifier.size(20.dp)
            )
        }
    }
}

/** In the "+" seat during a take, or to dismiss a failed one's notice. */
@Composable
fun DictationCancelButton(
    active: Boolean,
    color: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    seat: Dp = Seat
) {
    val label = stringResource(
        if (active) R.string.ui_dictation_cancel else R.string.ui_dictation_dismiss
    )
    Box(
        modifier
            .size(seat)
            .semantics { contentDescription = label }
            .clickableNoIndication(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(
            painter = painterResource(DesignR.drawable.ic_close),
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(22.dp)
        )
    }
}

@Composable
private fun Disc(
    ground: Color,
    label: String,
    onClick: () -> Unit,
    seat: Dp,
    modifier: Modifier = Modifier,
    disc: Dp = DiscSize,
    enabled: Boolean = true,
    glyph: @Composable () -> Unit
) {
    Box(
        modifier
            .size(seat)
            .semantics { contentDescription = label }
            .clickableNoIndication(onClick = onClick, enabled = enabled),
        contentAlignment = Alignment.Center
    ) {
        Box(
            Modifier
                .size(disc)
                .clip(CircleShape)
                .background(ground),
            contentAlignment = Alignment.Center
        ) {
            glyph()
        }
    }
}
