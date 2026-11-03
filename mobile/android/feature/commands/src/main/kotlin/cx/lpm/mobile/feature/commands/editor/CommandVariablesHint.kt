package cx.lpm.mobile.feature.commands.editor

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.sp
import cx.lpm.mobile.core.designsystem.theme.LpmTheme
import cx.lpm.mobile.core.model.promptVariables
import cx.lpm.mobile.core.ui.lpmCommandTint
import cx.lpm.mobile.feature.commands.R

/**
 * Under the editor's prompt: which `{{variables}}` a run asks for and which lpm fills
 * in by itself, or how to add them when the prompt has none. The desktop's
 * CommandEditor says the same.
 */
@Composable
internal fun CommandVariablesHint(prompt: String, name: String, modifier: Modifier = Modifier) {
    val (asks, auto) = promptVariables(prompt)
    val askTint = lpmCommandTint
    val autoTint = if (LpmTheme.colors.isDark) Color(0xFF4ADE80) else Color(0xFF16A34A)
    val text = if (asks.isEmpty() && auto.isEmpty()) {
        stringResource(R.string.command_hint_none, PLACEHOLDER_1, PLACEHOLDER_2, PLACEHOLDER_3)
            .styled(listOf("{{ticket}}", "{{branch}}", "{{project}}").map { Token(it) })
    } else {
        val asksLine = if (asks.isEmpty()) {
            AnnotatedString("")
        } else {
            stringResource(R.string.command_hint_asks, PLACEHOLDER_1, PLACEHOLDER_2).styled(
                listOf(Token(asks, askTint), Token("/" + name.ifEmpty { "name" }))
            )
        }
        val autoLine = if (auto.isEmpty()) {
            AnnotatedString("")
        } else {
            stringResource(
                R.string.command_hint_auto,
                PLACEHOLDER_1
            ).styled(listOf(Token(auto, autoTint)))
        }
        asksLine + autoLine
    }
    Text(
        text = text,
        style = LpmTheme.typography.footnote.copy(lineHeight = 16.sp),
        color = LpmTheme.colors.secondaryLabel,
        modifier = modifier.fillMaxWidth()
    )
}

/**
 * What a placeholder becomes: one monospaced [word], or a run of variable names, each
 * monospaced and tinted with a space after it, as iOS joins them.
 */
private class Token(val words: List<String>, val tint: Color?, val spaced: Boolean) {
    constructor(word: String) : this(listOf(word), null, spaced = false)

    constructor(names: List<String>, tint: Color) : this(names, tint, spaced = true)
}

private const val PLACEHOLDER_1 = "\u0001"
private const val PLACEHOLDER_2 = "\u0002"
private const val PLACEHOLDER_3 = "\u0003"

/** The resource sentence with its placeholders swapped for [parts]. */
private fun String.styled(parts: List<Token>): AnnotatedString = buildAnnotatedString {
    val marks = listOf(PLACEHOLDER_1, PLACEHOLDER_2, PLACEHOLDER_3)
    var rest = this@styled
    while (rest.isNotEmpty()) {
        val hit = marks.withIndex()
            .mapNotNull { (i, mark) -> rest.indexOf(mark).takeIf { it >= 0 }?.let { it to i } }
            .minByOrNull { it.first }
        if (hit == null) {
            append(rest)
            break
        }
        val (at, index) = hit
        append(rest.substring(0, at))
        val token = parts[index]
        val style = SpanStyle(
            fontFamily = FontFamily.Monospace,
            color =
                token.tint ?: Color.Unspecified
        )
        for (word in token.words) {
            withStyle(style) { append(word) }
            if (token.spaced) append(" ")
        }
        rest = rest.substring(at + 1)
    }
}
