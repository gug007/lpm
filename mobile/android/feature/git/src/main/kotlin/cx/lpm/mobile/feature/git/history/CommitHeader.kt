package cx.lpm.mobile.feature.git.history

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.ui.AgentMark
import cx.lpm.mobile.core.ui.AgentMarkIcon
import cx.lpm.mobile.feature.git.R
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/**
 * What the commit says, its short hash (which copies the full one), author, date and
 * whether it merges, the co-authors it credits and the rest of its message.
 */
@Composable
internal fun CommitHeader(
    commit: HistoryCommit,
    onCopyHash: () -> Unit,
    modifier: Modifier = Modifier
) {
    val colors = LpmTheme.colors
    val caption = LpmTheme.typography.caption1
    Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SelectionContainer {
            Text(commit.subject, style = LpmTheme.typography.headline, color = colors.label)
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(4.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            HashButton(commit.short, onCopyHash)
            val dot = stringResource(R.string.git_history_separator)
            val parts = buildList {
                add(dot)
                add(commit.author)
                add(dot)
                add(commitDate(commit.time))
                if (commit.isMerge) {
                    add(dot)
                    add(stringResource(R.string.git_history_merge))
                }
            }
            // `.minimumScaleFactor(0.85)`: the line shrinks a little before it cuts off.
            BasicText(
                text = parts.joinToString(" "),
                style = caption.copy(color = colors.secondaryLabel),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                autoSize = TextAutoSize.StepBased(
                    minFontSize = caption.fontSize * MIN_SCALE,
                    maxFontSize = caption.fontSize,
                    stepSize = 0.5.sp
                )
            )
        }
        if (commit.coAuthors.isNotEmpty()) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(5.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                commit.agent?.let(AgentMark::of)?.let { AgentMarkIcon(it, Modifier.size(12.dp)) }
                Text(
                    text = stringResource(
                        R.string.git_history_co_authors,
                        commit.coAuthorNames.joinToString(", ")
                    ),
                    style = caption,
                    color = colors.secondaryLabel
                )
            }
        }
        val message = commit.message
        if (message.isNotEmpty()) {
            SelectionContainer {
                Text(message, style = LpmTheme.typography.footnote, color = colors.secondaryLabel)
            }
        }
    }
}

/** The short hash in the tint with a copy glyph after it, a button copying the full hash. */
@Composable
private fun HashButton(short: String, onClick: () -> Unit) {
    val tint = LpmTheme.colors.tint
    val spoken = stringResource(R.string.git_history_copy_full_hash)
    Row(
        modifier = Modifier
            .clickable(onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = spoken
                role = Role.Button
            }
            .padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = short,
            style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace),
            color = tint,
            maxLines = 1
        )
        Icon(
            painter = painterResource(DesignR.drawable.ic_content_copy),
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(13.dp)
        )
    }
}

/** The commit's time the way iOS writes `.abbreviated` date and `.shortened` time. */
@Composable
private fun commitDate(time: Long): String {
    val (date, clock) = remember(time) {
        val locale = Locale.getDefault()
        val at = Instant.ofEpochSecond(time).atZone(ZoneId.systemDefault())
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale).format(at) to
            DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withLocale(locale).format(at)
    }
    return stringResource(R.string.git_history_date, date, clock)
}

private const val MIN_SCALE = 0.85f
