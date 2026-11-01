package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.HistoryCommit

/**
 * The commit's mark says what it is by shape as well as color, as on the desktop:
 * filled for one no remote has yet, a ring once pushed, a diamond for a merge.
 */
@Composable
internal fun CommitMark(commit: HistoryCommit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Box(
        modifier
            .width(12.dp)
            .clearAndSetSemantics {},
        contentAlignment = Alignment.Center
    ) {
        when {
            commit.isMerge -> Box(
                Modifier
                    .size(8.dp)
                    .rotate(45f)
                    .border(StrokeWidth, colors.secondaryLabel, RoundedCornerShape(1.5.dp))
            )

            commit.unpushed -> Box(
                Modifier
                    .size(9.dp)
                    .background(colors.cyan, CircleShape)
            )

            else -> Box(
                Modifier
                    .size(9.dp)
                    .border(StrokeWidth, colors.secondaryLabel, CircleShape)
            )
        }
    }
}

private val StrokeWidth = 1.2.dp
