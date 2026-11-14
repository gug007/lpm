package cx.lpm.mobile.feature.files.preview

import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.code.SyntaxColors
import cx.lpm.mobile.core.designsystem.code.highlightCode
import cx.lpm.mobile.core.designsystem.code.rememberSyntaxColors
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext

/** iOS's `monospacedSystemFont(ofSize: 13)`, the diff view's code font. */
internal val CodeStyle = TextStyle(
    fontFamily = FontFamily.Monospace,
    fontSize = 13.sp,
    lineHeight = 15.3.sp,
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None)
)

// Highlighting walks every character; past this a plain render stays instant.
private const val HIGHLIGHT_LIMIT = 300_000

// The tapped line's mark: the system yellow at iOS's 30%.
private const val MARK_ALPHA = 0.3f

/**
 * Read-only, selectable code with the diff view's highlighting (iOS
 * `ReadOnlyCodeView`), long lines wrapped, scrolled to [line] and that line marked
 * when the tapped path named one. Lines are laid out as they scroll in, so a long text
 * opens at once.
 */
@Composable
internal fun CodeView(
    text: String,
    ext: String,
    line: Int,
    modifier: Modifier = Modifier,
    highlightDispatcher: CoroutineDispatcher = Dispatchers.Default
) {
    val colors = rememberSyntaxColors()
    val lines = remember(text) { CodeLines(text) }
    val highlighted by produceState<List<AnnotatedString>?>(null, lines, ext, colors) {
        if (text.length <= HIGHLIGHT_LIMIT) {
            value = withContext(highlightDispatcher) { lines.highlighted(ext, colors) }
        }
    }
    val list = rememberLazyListState()
    val mark = SpanStyle(background = LpmTheme.colors.yellow.copy(alpha = MARK_ALPHA))
    LaunchedEffect(lines, line) { if (line > 1 && line <= lines.count) list.reveal(line - 1) }
    SelectionContainer(modifier) {
        LazyColumn(state = list, contentPadding = PaddingValues(12.dp)) {
            items(lines.count) { index ->
                val marked = index == line - 1
                val styled = highlighted?.getOrNull(index)
                if (styled != null) {
                    Text(styled.markedIf(marked, mark), style = CodeStyle)
                } else {
                    Text(
                        AnnotatedString(lines[index]).markedIf(marked, mark),
                        style = CodeStyle,
                        color = colors.plain
                    )
                }
            }
        }
    }
}

private fun AnnotatedString.markedIf(marked: Boolean, mark: SpanStyle): AnnotatedString {
    if (!marked) return this
    return AnnotatedString.Builder(this).apply { addStyle(mark, 0, length) }.toAnnotatedString()
}

/**
 * Scrolls the least that shows [index], as `UITextView.scrollRangeToVisible` does:
 * coming from the top, the line ends up at the bottom of the view.
 */
private suspend fun LazyListState.reveal(index: Int) {
    scrollToItem(index)
    val item = snapshotFlow { layoutInfo.visibleItemsInfo.firstOrNull { it.index == index } }
        .filterNotNull()
        .first()
    val end = layoutInfo.viewportEndOffset - layoutInfo.afterContentPadding
    val overshoot = item.offset + item.size - end
    if (overshoot < 0) scrollBy(overshoot.toFloat())
}

/** A text split at its newlines, each line's range kept for the highlighted copy. */
internal class CodeLines(private val text: String) {
    private val starts: IntArray = buildList {
        add(0)
        text.forEachIndexed { i, c -> if (c == '\n') add(i + 1) }
    }.toIntArray()

    val count: Int get() = starts.size

    operator fun get(index: Int): String = text.substring(starts[index], end(index))

    fun highlighted(ext: String, colors: SyntaxColors): List<AnnotatedString> {
        val all = highlightCode(text, ext, colors)
        return List(count) { all.subSequence(starts[it], end(it)) }
    }

    // A CRLF file breaks its lines once, as a text view reads "\r\n".
    private fun end(index: Int): Int {
        val end = if (index + 1 < starts.size) starts[index + 1] - 1 else text.length
        return if (end > starts[index] && text[end - 1] == '\r') end - 1 else end
    }
}
