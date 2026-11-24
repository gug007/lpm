package cx.lpm.mobile.feature.terminal.conversation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.data.conversation.ConversationDetail
import cx.lpm.mobile.core.designsystem.R as DesignR
import cx.lpm.mobile.core.designsystem.component.ActivityIndicator
import cx.lpm.mobile.core.designsystem.component.ActivityIndicatorSize
import cx.lpm.mobile.core.designsystem.component.CapsuleButton
import cx.lpm.mobile.core.designsystem.component.LinkButton
import cx.lpm.mobile.core.designsystem.component.MarkdownText
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.ConversationPart
import cx.lpm.mobile.feature.terminal.R

private const val FOLDED_LINES = 24
private val BLOCK_GROUND = Color.Black.copy(alpha = 0.28f)

/** What an opened call shows: what it was given, what came back, and its file. */
@Composable
internal fun ConversationToolDetail(
    detail: ConversationDetail?,
    path: String,
    onOpenPath: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        when (detail) {
            ConversationDetail.Loading, null ->
                ActivityIndicator(size = ActivityIndicatorSize.Small)

            is ConversationDetail.Failed -> Text(
                text = detail.error,
                style = LpmTheme.typography.footnote,
                color = LpmTheme.colors.red
            )

            is ConversationDetail.Parts -> {
                detail.parts.forEach { ConversationPartView(it) }
                if (detail.parts.isEmpty() && path.isEmpty()) {
                    Text(
                        text = stringResource(R.string.conversation_nothing_more),
                        style = LpmTheme.typography.footnote,
                        color = LpmTheme.colors.secondaryLabel
                    )
                }
            }
        }
        if (path.isNotEmpty()) {
            CapsuleButton(
                text = stringResource(R.string.conversation_open_file),
                onClick = { onOpenPath(path) },
                color = Color.White,
                leading = {
                    Icon(
                        painter = painterResource(DesignR.drawable.ic_description),
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(16.dp)
                    )
                }
            )
        }
    }
}

/**
 * What a tool call was given or returned. A long one stops at [FOLDED_LINES] until it's
 * opened, so it doesn't bury the conversation.
 */
@Composable
private fun ConversationPartView(part: ConversationPart) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val lines = remember(part.text) { part.text.split("\n") }
    val folds = part.style != ConversationPart.Style.Markdown && lines.size > FOLDED_LINES
    val shown = if (folds && !expanded) lines.take(FOLDED_LINES) else lines
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (part.label.isNotEmpty()) {
            Text(
                text = part.label,
                style = LpmTheme.typography.caption2.copy(fontWeight = FontWeight.SemiBold),
                color = LpmTheme.colors.secondaryLabel
            )
        }
        when (part.style) {
            ConversationPart.Style.Markdown -> MarkdownText(part.text)
            ConversationPart.Style.Code -> CodeBlock(shown)
            ConversationPart.Style.Diff -> DiffBlock(shown)
        }
        if (folds) {
            LinkButton(
                text = if (expanded) {
                    stringResource(R.string.conversation_show_less)
                } else {
                    stringResource(R.string.conversation_show_all_lines, lines.size.toString())
                },
                onClick = { expanded = !expanded },
                color = LpmTheme.colors.secondaryLabel
            )
        }
    }
}

@Composable
private fun CodeBlock(lines: List<String>) {
    SelectionContainer {
        Text(
            text = lines.joinToString("\n"),
            modifier = Modifier
                .fillMaxWidth()
                .background(BLOCK_GROUND, RoundedCornerShape(8.dp))
                .padding(8.dp),
            style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace),
            color = LpmTheme.colors.label
        )
    }
}

@Composable
private fun DiffBlock(lines: List<String>) {
    val colors = LpmTheme.colors
    SelectionContainer {
        Column(
            Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(8.dp))
                .background(BLOCK_GROUND)
                .padding(vertical = 6.dp)
        ) {
            lines.forEach { line ->
                Text(
                    text = line.ifEmpty { " " },
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(
                            when {
                                line.startsWith("+") -> colors.green.copy(alpha = 0.18f)
                                line.startsWith("-") -> colors.red.copy(alpha = 0.18f)
                                else -> Color.Transparent
                            }
                        )
                        .padding(horizontal = 8.dp, vertical = 1.dp),
                    style = LpmTheme.typography.caption1.copy(fontFamily = FontFamily.Monospace),
                    color = if (line.startsWith("@@")) colors.secondaryLabel else colors.label
                )
            }
        }
    }
}
