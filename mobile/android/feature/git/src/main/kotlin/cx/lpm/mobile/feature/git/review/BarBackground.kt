package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.background
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.compositeOver
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/** iOS's `.bar` material under a pinned button, with nothing scrolled beneath it. */
@Composable
internal fun Modifier.barBackground(): Modifier {
    val colors = LpmTheme.colors
    return background(
        colors.systemBackground.copy(
            alpha = BAR_ALPHA
        ).compositeOver(colors.secondarySystemBackground)
    )
}

private const val BAR_ALPHA = 0.6f
