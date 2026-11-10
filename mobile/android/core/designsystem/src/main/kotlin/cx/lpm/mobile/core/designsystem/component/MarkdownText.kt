package cx.lpm.mobile.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import cx.lpm.mobile.core.designsystem.component.MarkdownBlock.Kind
import cx.lpm.mobile.core.designsystem.theme.LpmTheme

/**
 * The markdown lpm documents use, drawn natively (iOS `MarkdownText`): headings,
 * bullet and numbered lists, fenced code, rules, and inline code, emphasis and links.
 * [speakingBlock] is the block being read aloud, washed in the tint. A long press
 * selects text unless [selectable] is off (where the press opens a menu instead).
 */
@Composable
fun MarkdownText(
    text: String,
    modifier: Modifier = Modifier,
    speakingBlock: Int? = null,
    selectable: Boolean = true
) {
    val blocks = remember(text) { MarkdownBlock.parse(text) }
    val colors = LpmTheme.colors
    val code = SpanStyle(
        fontFamily = FontFamily.Monospace,
        fontSize = LpmTheme.typography.callout.fontSize,
        color = colors.tint
    )
    val link = SpanStyle(color = colors.tint)
    val content = @Composable {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            blocks.forEach { block ->
                // Code blocks paint their own background and are never spoken.
                val highlight = if (block.id == speakingBlock && !block.isCode) {
                    colors.tint.copy(alpha = 0.14f)
                } else {
                    Color.Transparent
                }
                Column(Modifier.background(highlight, RoundedCornerShape(6.dp))) {
                    MarkdownBlockView(block, code, link)
                }
            }
        }
    }
    if (selectable) {
        SelectionContainer(modifier.fillMaxWidth(), content = content)
    } else {
        Box(modifier.fillMaxWidth()) { content() }
    }
}

@Composable
private fun MarkdownBlockView(block: MarkdownBlock, code: SpanStyle, link: SpanStyle) {
    val type = LpmTheme.typography
    val colors = LpmTheme.colors
    when (val kind = block.kind) {
        is Kind.Heading -> Text(
            text = markdownInline(block.text, code, link),
            style = headingStyle(kind.level),
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = if (kind.level <= 2) 8.dp else 2.dp)
        )

        Kind.Paragraph -> Text(
            text = markdownInline(block.text, code, link),
            style = type.callout,
            modifier = Modifier.fillMaxWidth()
        )

        is Kind.ListItem -> Row(
            Modifier.padding(start = 16.dp * kind.depth),
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            Text(
                text = kind.marker,
                style = type.callout.copy(fontFeatureSettings = "tnum"),
                color = colors.secondaryLabel,
                modifier = Modifier.alignByBaseline()
            )
            Text(
                text = markdownInline(block.text, code, link),
                style = type.callout,
                modifier = Modifier
                    .weight(1f)
                    .alignByBaseline()
            )
        }

        // Code keeps its lines and scrolls sideways; a block of words (a drafted
        // reply, a quoted message) wraps.
        is Kind.Code -> Text(
            text = block.text,
            style = type.footnote.copy(fontFamily = FontFamily.Monospace),
            softWrap = kind.wraps,
            modifier = Modifier
                .fillMaxWidth()
                .background(colors.secondarySystemBackground, RoundedCornerShape(10.dp))
                .then(
                    if (kind.wraps) Modifier else Modifier.horizontalScroll(rememberScrollState())
                )
                .padding(10.dp)
        )

        Kind.Rule -> Spacer(
            Modifier
                .padding(vertical = 2.dp)
                .fillMaxWidth()
                .height(1.dp)
                .background(colors.separator)
        )
    }
}

@Composable
private fun headingStyle(level: Int): TextStyle {
    val type = LpmTheme.typography
    return when (level) {
        1 -> type.title3.copy(fontWeight = FontWeight.Bold)
        2 -> type.headline
        3 -> type.subheadline.copy(fontWeight = FontWeight.SemiBold)
        else -> type.footnote.copy(fontWeight = FontWeight.SemiBold)
    }
}
