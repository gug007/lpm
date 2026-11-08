package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ProminentButton
import cx.lpm.mobile.feature.git.R

/**
 * The review's one action, pinned under the list so it stays in reach however far
 * the diffs scroll: "Commit N files", which opens the commit sheet.
 */
@Composable
internal fun CommitBar(
    selected: Int,
    committing: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Box(
        modifier
            .fillMaxWidth()
            .barBackground()
            .navigationBarsPadding()
            .padding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 6.dp)
    ) {
        ProminentButton(
            text = if (selected > 0) {
                pluralStringResource(R.plurals.git_review_commit_files, selected, selected)
            } else {
                stringResource(R.string.git_review_commit)
            },
            icon = painterResource(DesignR.drawable.ic_check_circle),
            busy = committing,
            enabled = !committing,
            onClick = onClick
        )
    }
}
