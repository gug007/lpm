package cx.lpm.mobile.feature.share

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** Over the form while it sends, and once it's sent or kept for later. */
@Composable
internal fun ShareProgressCard(
    state: ShareUiState,
    onDone: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val typography = LpmTheme.typography
    val macName = state.mac?.name ?: stringResource(R.string.share_your_mac)
    when (state.phase) {
        SharePhase.Sending -> Card(modifier) {
            ActivityIndicator(size = ActivityIndicatorSize.Large)
            Text(stringResource(R.string.share_sending, macName), style = typography.headline)
        }

        SharePhase.Sent -> Card(modifier) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_check_circle_fill),
                contentDescription = null,
                tint = colors.green,
                modifier = Modifier.size(52.dp)
            )
            Text(
                stringResource(R.string.share_sent, state.projectTitle),
                style = typography.headline
            )
        }

        SharePhase.Queued -> Card(modifier) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_alarm_on),
                contentDescription = null,
                tint = colors.secondaryLabel,
                modifier = Modifier.size(48.dp)
            )
            Text(stringResource(R.string.share_saved), style = typography.headline)
            Text(
                text = stringResource(R.string.share_saved_message, macName),
                style = typography.subheadline,
                color = colors.secondaryLabel,
                textAlign = TextAlign.Center
            )
            CapsuleButton(
                text = stringResource(R.string.share_done),
                onClick = onDone,
                prominent = true,
                textStyle = typography.headline,
                modifier = Modifier.padding(top = 4.dp)
            )
        }

        else -> Unit
    }
}

/** A card on a light scrim that keeps taps off the form under it. */
@Composable
private fun Card(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.25f))
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitPointerEvent(PointerEventPass.Final).changes.forEach { it.consume() }
                }
            },
        contentAlignment = Alignment.Center
    ) {
        Column(
            modifier = Modifier
                .widthIn(max = 300.dp)
                .background(LpmTheme.colors.menuBackground, RoundedCornerShape(22.dp))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
            content = content
        )
    }
}
