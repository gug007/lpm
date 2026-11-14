package cx.lpm.mobile.feature.git.review

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.clickableNoIndication
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.feature.git.R

/**
 * Above Commit while a commit is being written: its message and what's left out, so
 * coming back to Changes shows the draft was kept, with × to start over.
 */
@Composable
internal fun CommitDraftChip(draft: DraftChip, onClear: () -> Unit, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    val style = LpmTheme.typography.footnote
    val clear = stringResource(R.string.git_review_clear_draft)
    Box(
        modifier
            .fillMaxWidth()
            .barBackground()
            .padding(start = 16.dp, end = 16.dp, top = 8.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.secondarySystemGroupedBackground, RoundedCornerShape(12.dp))
                .padding(start = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                painter = painterResource(DesignR.drawable.ic_edit),
                contentDescription = null,
                tint = colors.secondaryLabel,
                modifier = Modifier.size(15.dp)
            )
            Text(
                text = draftSummary(draft),
                style = style,
                color = colors.label,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
            Box(
                modifier = Modifier
                    .size(width = 48.dp, height = 36.dp)
                    .clickableNoIndication(onClear)
                    .semantics { contentDescription = clear },
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    painter = painterResource(DesignR.drawable.ic_close),
                    contentDescription = null,
                    tint = colors.secondaryLabel,
                    modifier = Modifier.size(15.dp)
                )
            }
        }
    }
}

/** "Draft: “fix: …” · page.tsx left out", each part only when there is one. */
@Composable
private fun draftSummary(draft: DraftChip): String {
    val parts = buildList {
        draft.firstLine?.let { add(stringResource(R.string.git_review_draft_message, it)) }
        when (draft.leftOut.size) {
            0 -> Unit

            1 -> add(stringResource(R.string.git_review_draft_left_out, draft.leftOut[0]))

            else -> add(
                stringResource(R.string.git_review_draft_left_out_files, draft.leftOut.size)
            )
        }
    }
    val summary = parts.joinToString(stringResource(R.string.git_review_draft_separator))
    return stringResource(R.string.git_review_draft, summary)
}
