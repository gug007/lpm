package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.unit.dp
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

/** The pinned bar under the review and the commit sheet: full width, on [barBackground]. */
@Composable
internal fun Modifier.bottomBar(): Modifier =
    fillMaxWidth().barBackground().padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 6.dp)
