package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.TopBarTitle
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R

/** "History" over the branch and how many of its commits aren't pushed, read as one. */
@Composable
internal fun HistoryTitle(
    branch: String,
    unpushed: Int,
    unpushedMore: Boolean,
    modifier: Modifier = Modifier
) {
    val title = stringResource(R.string.git_history_title)
    val merged = modifier.semantics(mergeDescendants = true) {}
    if (branch.isEmpty() && unpushed == 0) return TopBarTitle(title = title, modifier = merged)
    TopBarTitle(
        title = title,
        modifier = merged,
        subtitleContent = {
            val colors = LpmTheme.colors
            val caption = LpmTheme.typography.caption1
            Row(
                modifier = Modifier.padding(top = 1.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (branch.isNotEmpty()) {
                    Text(
                        text = branch,
                        style = caption.copy(fontFamily = FontFamily.Monospace),
                        color = colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.MiddleEllipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                }
                if (unpushed > 0) {
                    if (branch.isNotEmpty()) {
                        Text(
                            stringResource(R.string.git_history_separator),
                            style = caption,
                            color = colors.secondaryLabel
                        )
                    }
                    val more = if (unpushedMore) stringResource(R.string.git_history_more) else ""
                    Text(
                        text = stringResource(R.string.git_history_not_pushed, unpushed, more),
                        style = caption,
                        color = colors.cyan,
                        maxLines = 1
                    )
                }
            }
        }
    )
}
