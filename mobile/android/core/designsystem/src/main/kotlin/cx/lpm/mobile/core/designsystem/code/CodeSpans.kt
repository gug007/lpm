package cx.lpm.mobile.core.designsystem.code

import android.text.Spannable
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.text.style.LeadingMarginSpan
import androidx.compose.ui.graphics.isSpecified
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.AnnotatedString
import kotlin.math.roundToInt

/** The code editor's own spans, so a restyle replaces exactly what the last one added. */
internal class CodeColorSpan(color: Int) : ForegroundColorSpan(color)

internal class WrapIndentSpan(val rest: Int) : LeadingMarginSpan.Standard(0, rest)

/**
 * Paints [highlighted]'s colors over the text and gives each line a hanging indent of
 * its own leading spaces plus [wrapIndent] columns, each [column] pixels wide.
 */
internal fun Spannable.styleCode(highlighted: AnnotatedString?, column: Float, wrapIndent: Int) {
    getSpans(0, length, CodeColorSpan::class.java).forEach(::removeSpan)
    getSpans(0, length, WrapIndentSpan::class.java).forEach(::removeSpan)
    highlighted?.spanStyles?.forEach { range ->
        val color = range.item.color
        if (color.isSpecified && range.start < range.end && range.end <= length) {
            setSpan(
                CodeColorSpan(color.toArgb()),
                range.start,
                range.end,
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
            )
        }
    }
    var start = 0
    while (start < length) {
        val newline = indexOf('\n', start)
        val end = if (newline < 0) length else newline + 1
        var spaces = 0
        while (start + spaces < end && this[start + spaces] == ' ') spaces++
        val columns = spaces + wrapIndent
        if (columns > 0) {
            setSpan(
                WrapIndentSpan((columns * column).roundToInt()),
                start,
                end,
                Spanned.SPAN_PARAGRAPH
            )
        }
        start = end
    }
}
