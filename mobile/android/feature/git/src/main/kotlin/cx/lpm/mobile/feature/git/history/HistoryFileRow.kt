package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.DisclosureChevron
import cx.lpm.mobile.core.designsystem.component.ListRow
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.ui.GitStatusBadge
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.review.DiffStat

/** A file the commit changed: its status, name over folder (or where it was renamed from), line counts. */
@Composable
internal fun HistoryFileRow(file: CommitFile, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    ListRow(
        onClick = onClick,
        modifier = modifier,
        trailing = {
            Spacer(Modifier.width(6.dp))
            val added = file.added
            if (added == null) {
                Text(
                    stringResource(R.string.git_history_binary),
                    style = LpmTheme.typography.caption1,
                    color = colors.secondaryLabel
                )
            } else {
                DiffStat(added, file.removed ?: 0)
            }
            DisclosureChevron(Modifier.padding(start = 8.dp))
        }
    ) {
        Row(
            modifier = Modifier.weight(1f),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            GitStatusBadge(file.status)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                Text(
                    text = file.name,
                    style = LpmTheme.typography.subheadline.copy(fontWeight = FontWeight.SemiBold),
                    color = colors.label,
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis
                )
                val under = file.oldPath?.let { stringResource(R.string.git_history_from, it) }
                    ?: file.directory.ifEmpty { null }
                if (under != null) {
                    Text(
                        text = under,
                        style = LpmTheme.typography.caption1,
                        color = colors.secondaryLabel,
                        maxLines = 1,
                        overflow = TextOverflow.StartEllipsis
                    )
                }
            }
        }
    }
}
