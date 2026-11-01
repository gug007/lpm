package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.ListDefaults
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.CommitFile
import cx.lpm.mobile.core.model.lineTotals
import cx.lpm.mobile.feature.git.R
import cx.lpm.mobile.feature.git.review.DiffStat

/** The files section's header: "N files" and the lines they add and remove, or "Files". */
@Composable
internal fun CommitFilesHeader(files: List<CommitFile>?, modifier: Modifier = Modifier) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                start = ListDefaults.RowPadding,
                end = ListDefaults.RowPadding,
                top = 2.dp,
                bottom = 8.8.dp
            ),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        val style = LpmTheme.typography.headline
        val color = LpmTheme.colors.secondaryLabel
        if (files == null) {
            Text(stringResource(R.string.git_history_files), style = style, color = color)
            return@Row
        }
        Text(
            text = pluralStringResource(R.plurals.git_history_file_count, files.size, files.size),
            style = style,
            color = color,
            modifier = Modifier.alignByBaseline()
        )
        val (added, removed) = files.lineTotals
        DiffStat(added, removed, Modifier.alignByBaseline())
    }
}
