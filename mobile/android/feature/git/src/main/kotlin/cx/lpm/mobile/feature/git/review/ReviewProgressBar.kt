package cx.lpm.mobile.feature.git.review

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** A bar that fills as [done] of [total] files are. */
@Composable
internal fun ReviewProgressBar(done: Int, total: Int, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val progress by animateFloatAsState(
        targetValue = done.toFloat() / total.coerceAtLeast(1),
        animationSpec = tween(PROGRESS_MS),
        label = "done"
    )
    Box(
        modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(CircleShape)
            .background(colors.tertiarySystemFill)
    ) {
        Box(
            Modifier
                .fillMaxHeight()
                .fillMaxWidth(progress)
                .clip(CircleShape)
                .background(colors.green)
        )
    }
}

private const val PROGRESS_MS = 250
