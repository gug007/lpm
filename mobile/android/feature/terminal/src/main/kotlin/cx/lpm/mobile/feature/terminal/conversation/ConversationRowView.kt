package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.MarkdownText
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ConversationItem.Kind
import cx.lpm.mobile.core.model.ConversationRow
import cx.lpm.mobile.feature.terminal.R

private const val FOLDED_LINES = 12
private const val LONG_PROMPT_CHARS = 480

/**
 * One row of an agent's conversation. [live] while the agent is at work or waiting: a
 * call without its result is going on now.
 */
@Composable
internal fun ConversationRowView(
    row: ConversationRow,
    live: Boolean,
    actions: ConversationActions,
    modifier: Modifier = Modifier
) {
    when (row) {
        is ConversationRow.Lookups -> ConversationLookups(row, live, actions, modifier)

        is ConversationRow.Entry -> when (val kind = row.item.kind) {
            is Kind.Prompt -> ConversationPrompt(kind.text, kind.images, modifier)

            is Kind.Text -> MarkdownText(kind.text, modifier)

            is Kind.Tool -> ConversationToolRow(row.item, kind.tool, live, actions, modifier)

            is Kind.Notice -> Text(
                text = kind.text,
                modifier = modifier.fillMaxWidth().padding(vertical = 2.dp),
                style = LpmTheme.typography.footnote,
                color = LpmTheme.colors.secondaryLabel,
                textAlign = TextAlign.Center
            )
        }
    }
}

/** What the person asked. A long one stops at a screenful until it's opened. */
@Composable
internal fun ConversationPrompt(text: String, images: Int, modifier: Modifier = Modifier) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val isLong = text.length > LONG_PROMPT_CHARS || text.count { it == '\n' } >= FOLDED_LINES
    Row(
        modifier.fillMaxWidth().padding(start = 40.dp),
        horizontalArrangement = Arrangement.End
    ) {
        Column(
            Modifier
                .background(Color.White.copy(alpha = 0.1f), RoundedCornerShape(18.dp))
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            if (text.isNotEmpty()) {
                SelectionContainer {
                    Text(
                        text = text,
                        style = LpmTheme.typography.callout,
                        color = LpmTheme.colors.label,
                        maxLines = if (isLong && !expanded) FOLDED_LINES else Int.MAX_VALUE,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }
            if (images > 0) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        painter = painterResource(DesignR.drawable.ic_image),
                        contentDescription = null,
                        tint = LpmTheme.colors.secondaryLabel,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = pluralStringResource(R.plurals.conversation_images, images, images),
                        style = LpmTheme.typography.footnote,
                        color = LpmTheme.colors.secondaryLabel
                    )
                }
            }
            if (isLong) {
                LinkButton(
                    text = stringResource(
                        if (expanded) {
                            R.string.conversation_show_less
                        } else {
                            R.string.conversation_show_more
                        }
                    ),
                    onClick = { expanded = !expanded },
                    color = LpmTheme.colors.secondaryLabel
                )
            }
        }
    }
}

/**
 * A prompt sent from here that the transcript doesn't have yet; [queued] while the
 * agent is at work, which takes it when it gets to it.
 */
@Composable
internal fun ConversationPendingPrompt(
    text: String,
    queued: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(4.dp),
        horizontalAlignment = Alignment.End
    ) {
        ConversationPrompt(text, images = 0, modifier = Modifier.alpha(0.6f))
        Text(
            text = stringResource(
                if (queued) R.string.conversation_queued else R.string.conversation_sending
            ),
            modifier = Modifier.padding(end = 6.dp),
            style = LpmTheme.typography.caption1,
            color = LpmTheme.colors.secondaryLabel
        )
    }
}
