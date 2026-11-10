package cx.lpm.mobile.feature.speech.text

import androidx.compose.ui.text.SpanStyle
import cx.lpm.mobile.core.designsystem.component.MarkdownBlock
import cx.lpm.mobile.core.designsystem.component.markdownInline

/**
 * One spoken unit — a sentence, list item, or table row — tagged with the markdown
 * block it came from so the reader can highlight what it is saying. [pauseMs] is the
 * extra silence after it: headings and list items get a beat so a document doesn't
 * arrive as one unbroken sentence.
 */
data class SpeechSegment(val id: Int, val blockId: Int, val text: String, val pauseMs: Long)

/**
 * Turns an automation's markdown into text worth listening to (iOS `SpeechText`).
 * Read literally, a result is unlistenable: heading hashes become "hash hash hash" and
 * a single link swallows twenty seconds of URL. Link targets, emphasis markers, fences
 * and rules all come out; link text, list items and table cells stay.
 */
object SpeechText {
    fun segments(markdown: String): List<SpeechSegment> {
        val out = mutableListOf<SpeechSegment>()
        val emit = { text: String, block: Int, pauseMs: Long ->
            val cleaned = clean(text)
            if (speakable(cleaned)) out += SpeechSegment(out.size, block, cleaned, pauseMs)
        }
        for (block in MarkdownBlock.parse(markdown)) {
            // Notation goes before sentences are found: the "!" of an image ends a
            // sentence for the tokenizer, which would split the syntax in half.
            val text = stripNotation(block.text)
            when (block.kind) {
                is MarkdownBlock.Kind.Code, MarkdownBlock.Kind.Rule -> Unit

                is MarkdownBlock.Kind.Heading -> emit(text, block.id, 500)

                is MarkdownBlock.Kind.ListItem -> {
                    val parts = Sentences.split(text)
                    parts.forEachIndexed { i, s ->
                        emit(s, block.id, if (i == parts.lastIndex) 350 else 100)
                    }
                }

                MarkdownBlock.Kind.Paragraph -> emitParagraph(text, block.id, emit)
            }
        }
        return out
    }

    private fun emitParagraph(text: String, id: Int, emit: (String, Int, Long) -> Unit) {
        val lines = text.split("\n")
        // A pipe table arrives as an ordinary paragraph — the renderer has no table
        // block — so its rows would otherwise be read pipe by pipe.
        if (lines.any { it.trim().startsWith("|") }) {
            for (line in lines) {
                val trimmed = line.trim()
                if (trimmed.startsWith("|")) {
                    tableRow(trimmed)?.let { emit(it, id, 350) }
                } else {
                    emit(trimmed, id, 200)
                }
            }
            return
        }
        val parts = Sentences.split(lines.joinToString(" "))
        parts.forEachIndexed { i, s -> emit(s, id, if (i == parts.lastIndex) 300 else 100) }
    }

    /** Table cells joined into a phrase; null for the `|---|:--:|` separator row. */
    private fun tableRow(line: String): String? {
        val body = line.removePrefix("|").removeSuffix("|")
        // Cells with no word in them — a "#" header, a dash placeholder — are noise.
        val cells = body.split("|").map { it.trim() }.filter(::speakable)
        return cells.takeIf { it.isNotEmpty() }?.joinToString(", ")
    }

    /**
     * Strip everything that is notation rather than words. The inline parser does the
     * well-formed cases — `[text](url)` keeps `text` — but plenty of markdown never
     * reaches it intact, so the passes narrow down to a final rule: no token without a
     * letter or digit in it is ever spoken.
     */
    private fun clean(text: String): String {
        var s = inlinePlain(text)
        s = URL.replace(s, " ")
        s = despecial(s)
        s = dropWordlessTokens(s)
        return s.trim()
    }

    /**
     * Block-level syntax that has to go before the text is cut into sentences. An
     * image keeps its alt text — real prose, whose loss leaves a hole in the sentence.
     */
    private fun stripNotation(text: String): String {
        // A link definition (`[ref]: https://…`) has nothing left to say without its URL.
        var s = text.split("\n").filterNot { LINK_DEFINITION.containsMatchIn(it) }
            .joinToString("\n")
        s = IMAGE.replace(s, "$1")
        s = FOOTNOTE.replace(s, " ")
        s = HTML_TAG.replace(s, " ")
        s = TASK_BOX.replace(s, " ")
        return s
    }

    /**
     * Markdown punctuation that glues to words (`**bold**`, `` `code` ``) is deleted;
     * punctuation that separates words (`a|b`, `> quote`) becomes a space. Decorative
     * symbols — check marks, arrows, box drawing, emoji — go too: spoken, they become
     * "check mark", "rightwards arrow", "black square".
     */
    private fun despecial(text: String): String = buildString {
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            i += Character.charCount(cp)
            when {
                isDeleted(cp) -> Unit
                cp < 0x80 && SPACED.indexOf(cp.toChar()) >= 0 -> append(' ')
                isDecorativeSymbol(cp) -> append(' ')
                else -> appendCodePoint(cp)
            }
        }
    }

    private fun isDeleted(cp: Int): Boolean =
        (cp < 0x80 && DELETED.indexOf(cp.toChar()) >= 0) || cp == ZWJ || cp in VARIATION_SELECTORS

    private fun isDecorativeSymbol(cp: Int): Boolean {
        // "+" reads as "plus" in "+15.4%", which is meaning, not decoration.
        if (cp == '+'.code) return false
        return when (Character.getType(cp).toByte()) {
            Character.OTHER_SYMBOL, Character.MODIFIER_SYMBOL, Character.MATH_SYMBOL -> true
            else -> Emoji.isPresentation(cp)
        }
    }

    /**
     * The safety net: a run of characters with no letter or digit in it — a stray
     * bullet, an orphan dash, the "()" left where a link used to be — is dropped.
     */
    private fun dropWordlessTokens(text: String): String =
        text.split(WHITESPACE).filter(::speakable).joinToString(" ")

    private fun inlinePlain(text: String): String =
        HtmlEntities.decode(markdownInline(text, PLAIN, PLAIN).text)

    /** Anything with no letter or digit in it is silence, not speech. */
    private fun speakable(text: String): Boolean {
        var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            if (isAlphanumeric(cp)) return true
            i += Character.charCount(cp)
        }
        return false
    }

    /** Foundation's `.alphanumerics`: letters, marks and numbers of every kind. */
    private fun isAlphanumeric(cp: Int): Boolean = when (Character.getType(cp).toByte()) {
        Character.UPPERCASE_LETTER, Character.LOWERCASE_LETTER, Character.TITLECASE_LETTER,
        Character.MODIFIER_LETTER, Character.OTHER_LETTER, Character.NON_SPACING_MARK,
        Character.ENCLOSING_MARK, Character.COMBINING_SPACING_MARK,
        Character.DECIMAL_DIGIT_NUMBER, Character.LETTER_NUMBER, Character.OTHER_NUMBER -> true

        else -> false
    }

    private val PLAIN = SpanStyle()
    private val URL = Regex("(?i)\\b(?:https?://|www\\.)\\S+")
    private val IMAGE = Regex("!\\[([^\\]]*)\\]\\([^)]*\\)")
    private val FOOTNOTE = Regex("\\[\\^[^\\]]*\\]")
    private val HTML_TAG = Regex("</?[A-Za-z][^>]*>")

    /** A task-list box at the start of a list item: `[ ]`, `[x]`, `[X]`. */
    private val TASK_BOX = Regex("^\\s*\\[[ xX]?\\]\\s*")
    private val LINK_DEFINITION = Regex("^\\s*\\[[^\\]]+\\]:\\s*\\S*\\s*$")
    private val WHITESPACE = Regex("\\s+")
    private const val DELETED = "*`~^\\"
    private const val SPACED = "_|<>[]{}=#"
    private const val ZWJ = 0x200D
    private val VARIATION_SELECTORS = 0xFE00..0xFE0F
}
