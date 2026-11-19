package cx.lpm.mobile.feature.git.review

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.designsystem.theme.isLargeText
import cx.lpm.mobile.feature.git.R

/**
 * The top of the review: how many files changed and how many are viewed, over a bar
 * that fills as files are marked viewed.
 */
@Composable
internal fun ReviewSummary(row: ReviewRow.Summary, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val done = row.total > 0 && row.viewed == row.total
    val progress by animateFloatAsState(
        targetValue = row.viewed.toFloat() / row.total.coerceAtLeast(1),
        animationSpec = tween(PROGRESS_MS),
        label = "viewed"
    )
    Column(
        modifier = modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) {}
            .padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 14.dp)
    ) {
        val title: @Composable (Modifier) -> Unit = {
            Text(
                text = row.title ?: pluralStringResource(
                    R.plurals.git_review_files_changed,
                    row.total,
                    row.total
                ),
                style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                color = colors.label,
                modifier = it
            )
        }
        val viewedCount: @Composable () -> Unit = {
            Row(
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                val tint = if (done) colors.green else colors.secondaryLabel
                if (done) {
                    Icon(
                        painter = painterResource(DesignR.drawable.ic_check_circle_fill),
                        contentDescription = null,
                        tint = tint,
                        modifier = Modifier.size(15.dp)
                    )
                }
                Text(
                    text = stringResource(R.string.git_review_viewed, row.viewed, row.total),
                    style = LpmTheme.typography.footnote.copy(
                        fontWeight = FontWeight.Medium,
                        fontFeatureSettings = "tnum"
                    ),
                    color = tint
                )
            }
        }
        if (isLargeText()) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                title(Modifier)
                viewedCount()
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                title(Modifier.weight(1f))
                viewedCount()
            }
        }
        Spacer(Modifier.height(10.dp))
        Box(
            Modifier
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
}

private const val PROGRESS_MS = 250
