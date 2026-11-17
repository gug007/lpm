package cx.lpm.mobile.feature.projects.list

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.WorkState
import cx.lpm.mobile.core.model.WorkStatus
import cx.lpm.mobile.feature.projects.R

/**
 * The line under a row's name for the status a person gave it: the state's
 * emoji, its word, then the note when there is one. Only Blocked's word takes
 * color.
 */
@Composable
fun WorkStatusLine(status: WorkStatus, modifier: Modifier = Modifier) {
    val colors = LpmTheme.colors
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        val style = LpmTheme.typography.caption1
        if (status.displayEmoji.isNotEmpty()) {
            Text(
                text = status.displayEmoji,
                style = style,
                maxLines = 1,
                modifier = Modifier.clearAndSetSemantics {}
            )
        }
        Text(
            text = status.displayLabel,
            style = style,
            color = if (status.state == WorkState.Blocked) colors.red else colors.secondaryLabel,
            maxLines = 1
        )
        status.note?.let { note ->
            Text(
                stringResource(R.string.dot_separator),
                style = style,
                color = colors.secondaryLabel
            )
            Text(
                text = note,
                style = style,
                color = colors.secondaryLabel,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
