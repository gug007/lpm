package cx.lpm.mobile.core.push

import android.content.Context
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import cx.lpm.mobile.core.data.push.PushAlert
import cx.lpm.mobile.core.data.push.PushChangedFile

/**
 * What a finished turn's notification shows pulled open (iOS `AgentAnswerCard`): the
 * line saying what happened, the agent's answer with its Markdown drawn, and the files
 * the turn changed. An older Mac sends no answer, so its closing line stands in.
 */
internal fun Context.expandedText(alert: PushAlert, body: String): CharSequence {
    val text = SpannableStringBuilder(body)
    val answer = alert.answer?.let(::answerText) ?: alert.summary
    if (answer != null) text.append('\n').append(answer)
    if (alert.files.isNotEmpty()) {
        text.append("\n\n")
        alert.files.forEachIndexed { i, file ->
            if (i > 0) text.append('\n')
            text.appendFile(file)
        }
        val more = alert.changedFiles - alert.files.size
        if (more > 0) {
            text.append(
                '\n'
            ).append(resources.getQuantityString(R.plurals.alert_more_files, more, more))
        }
    }
    return text
}

/** "payments.ts  lib  +31 −2", the name carrying the weight as the review screen has it. */
private fun SpannableStringBuilder.appendFile(file: PushChangedFile) {
    styled(StyleSpan(Typeface.BOLD)) { append(file.name) }
    if (file.directory.isNotEmpty()) append("  ").append(file.directory)
    if (file.added > 0) append("  +").append(file.added.toString())
    if (file.removed >
        0
    ) {
        append(if (file.added > 0) " −" else "  −").append(file.removed.toString())
    }
}

/**
 * The Markdown subset agents answer in, drawn the way a notification can: headings and
 * bold in bold, code in monospace, list items behind a bullet, one line per block.
 */
internal fun answerText(markdown: String): CharSequence {
    val text = SpannableStringBuilder()
    var fenced = false
    fun newLine() {
        if (text.isNotEmpty() && text.last() != '\n') text.append('\n')
    }
    for (line in markdown.lines()) {
        val trimmed = line.trim()
        when {
            trimmed.startsWith("```") || trimmed.startsWith("~~~") -> fenced = !fenced

            fenced -> {
                newLine()
                text.styled(TypefaceSpan("monospace")) { append(line) }
            }

            trimmed.isEmpty() || isRule(trimmed) -> newLine()

            HEADING.matches(trimmed) -> {
                newLine()
                text.styled(StyleSpan(Typeface.BOLD)) {
                    appendInline(trimmed.trimStart('#').trim())
                }
            }

            else -> {
                newLine()
                val item = LIST_ITEM.matchEntire(line)
                if (item == null) {
                    text.appendInline(trimmed)
                } else {
                    val (indent, marker, rest) = item.destructured
                    text.append("  ".repeat(minOf(MAX_DEPTH, indent.length / 2)))
                    text.append(if (marker.first().isDigit()) "$marker " else "• ")
                    text.appendInline(rest)
                }
            }
        }
    }
    return text.dropTrailingNewlines()
}

private fun SpannableStringBuilder.appendInline(source: String) {
    var at = 0
    for (match in INLINE.findAll(source)) {
        append(source, at, match.range.first)
        val (code, bold, underscored, italic, link) = match.destructured
        when {
            code.isNotEmpty() -> styled(TypefaceSpan("monospace")) { append(code) }

            bold.isNotEmpty() -> styled(StyleSpan(Typeface.BOLD)) { appendInline(bold) }

            underscored.isNotEmpty() -> styled(StyleSpan(Typeface.BOLD)) {
                appendInline(underscored)
            }

            italic.isNotEmpty() -> styled(StyleSpan(Typeface.ITALIC)) { appendInline(italic) }

            else -> appendInline(link)
        }
        at = match.range.last + 1
    }
    append(source, at, source.length)
}

private inline fun SpannableStringBuilder.styled(
    span: Any,
    write: SpannableStringBuilder.() -> Unit
) {
    val start = length
    write()
    setSpan(span, start, length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
}

private fun isRule(trimmed: String): Boolean =
    trimmed.length >= 3 && trimmed.first() in "-*_" && trimmed.all { it == trimmed.first() }

private fun SpannableStringBuilder.dropTrailingNewlines(): CharSequence {
    while (isNotEmpty() && last() == '\n') delete(length - 1, length)
    return this
}

private const val MAX_DEPTH = 3

private val HEADING = Regex("""#{1,6}(\s.*)?""")

private val LIST_ITEM = Regex("""([ \t]*)([-*+]|\d+\.)\s+(.*)""")

private val INLINE = Regex(
    """`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(?=\S)(.+?)(?<=\S)\*|\[([^\]]+)]\([^)]*\)"""
)
