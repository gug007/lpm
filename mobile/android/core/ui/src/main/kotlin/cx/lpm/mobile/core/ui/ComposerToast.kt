package cx.lpm.mobile.core.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import kotlinx.coroutines.delay

private const val VISIBLE_MS = 6_000L
private const val FADE_MS = 200
private const val GROUND_ALPHA = 0.85f
private const val BORDER_ALPHA = 0.15f
private const val MAX_LINES = 3
private val Corner = RoundedCornerShape(18.dp)

/**
 * A composer's passing message: what just happened, or why it couldn't, without
 * stopping you to tap OK. Put it at the composer's top edge: it takes no height and
 * rises from there, over whatever is behind, so the composer never moves. It leaves
 * by itself, or when tapped.
 */
@Composable
fun ComposerToast(
    text: String?,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
    action: String? = null,
    onAction: () -> Unit = {}
) {
    val dismiss by rememberUpdatedState(onDismiss)
    LaunchedEffect(text) {
        if (text != null) {
            delay(VISIBLE_MS)
            dismiss()
        }
    }
    AnimatedContent(
        targetState = text,
        modifier = modifier
            .fillMaxWidth()
            .layout { measurable, constraints ->
                val placeable = measurable.measure(
                    constraints.copy(minHeight = 0, maxHeight = Constraints.Infinity)
                )
                layout(placeable.width, 0) { placeable.place(0, -placeable.height) }
            },
        contentAlignment = Alignment.BottomCenter,
        transitionSpec = { fadeIn(tween(FADE_MS)) togetherWith fadeOut(tween(FADE_MS)) },
        label = "composer-toast"
    ) { shown ->
        if (shown != null) {
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                ToastCapsule(shown, action, onAction, onDismiss)
            }
        }
    }
}

@Composable
private fun ToastCapsule(
    text: String,
    action: String?,
    onAction: () -> Unit,
    onDismiss: () -> Unit
) {
    Row(
        modifier = Modifier
            .padding(start = 16.dp, end = 16.dp, bottom = 8.dp)
            .background(Color.Black.copy(alpha = GROUND_ALPHA), Corner)
            .border(1.dp, Color.White.copy(alpha = BORDER_ALPHA), Corner)
            .clickableNoIndication(onClick = onDismiss)
            .semantics { liveRegion = LiveRegionMode.Polite }
            .padding(
                start = 14.dp,
                end = if (action == null) 14.dp else 6.dp,
                top = if (action == null) 9.dp else 6.dp,
                bottom = if (action == null) 9.dp else 6.dp
            ),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = text,
            style = LpmTheme.typography.footnote,
            color = Color.White,
            maxLines = MAX_LINES,
            modifier = Modifier.weight(1f, fill = false)
        )
        if (action != null) {
            Text(
                text = action,
                style = LpmTheme.typography.footnote.copy(fontWeight = FontWeight.SemiBold),
                color = Color.Black,
                modifier = Modifier
                    .background(Color.White, CircleShape)
                    .clickableNoIndication(onClick = {
                        onDismiss()
                        onAction()
                    })
                    .padding(horizontal = 12.dp, vertical = 4.dp)
            )
        }
    }
}
