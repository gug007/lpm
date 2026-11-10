package cx.lpm.mobile.core.designsystem.component

/**
 * One block of the markdown subset lpm documents use. Shared by [MarkdownText] and by
 * the read-aloud text, so a block has one identity whether it's drawn or spoken.
 */
data class MarkdownBlock(val id: Int, val kind: Kind, val text: String) {
    sealed interface Kind {
        data class Heading(val level: Int) : Kind

        data object Paragraph : Kind

        data class ListItem(val marker: String, val depth: Int) : Kind

        /** A fence; [wraps] when it has no language, or a prose one. */
        data class Code(val wraps: Boolean) : Kind

        data object Rule : Kind
    }

    val isCode: Boolean get() = kind is Kind.Code

    companion object {
        /**
         * One pass over the lines: a fence swallows everything up to its closing fence,
         * a blank line ends a paragraph, and anything unrecognized is paragraph text.
         * Soft line breaks inside a paragraph are kept: these documents use them as
         * real breaks.
         */
        fun parse(source: String): List<MarkdownBlock> {
            val blocks = mutableListOf<MarkdownBlock>()
            val paragraph = mutableListOf<String>()
            var fenced: MutableList<String>? = null
            var fenceWraps = true

            fun emit(kind: Kind, text: String) {
                blocks += MarkdownBlock(blocks.size, kind, text)
            }

            fun flushParagraph() {
                if (paragraph.isEmpty()) return
                emit(Kind.Paragraph, paragraph.joinToString("\n"))
                paragraph.clear()
            }

            for (line in source.split("\n")) {
                val trimmed = line.trimSpaces()
                val open = fenced
                when {
                    trimmed.startsWith("```") || trimmed.startsWith("~~~") -> if (open != null) {
                        emit(Kind.Code(fenceWraps), open.joinToString("\n"))
                        fenced = null
                    } else {
                        flushParagraph()
                        fenced = mutableListOf()
                        fenceWraps = proseFence(trimmed)
                    }

                    open != null -> open += line

                    trimmed.isEmpty() -> flushParagraph()

                    isRule(trimmed) -> {
                        flushParagraph()
                        emit(Kind.Rule, "")
                    }

                    else -> {
                        val heading = heading(trimmed)
                        val item = if (heading == null) listItem(line) else null
                        when {
                            heading != null -> {
                                flushParagraph()
                                emit(Kind.Heading(heading.first), heading.second)
                            }

                            item != null -> {
                                flushParagraph()
                                emit(item.first, item.second)
                            }

                            else -> paragraph += trimmed
                        }
                    }
                }
            }
            fenced?.let { emit(Kind.Code(fenceWraps), it.joinToString("\n")) }
            flushParagraph()
            return blocks
        }

        private val proseLanguages =
            setOf("", "text", "txt", "plain", "plaintext", "markdown", "md")

        /** A fence that holds words rather than code, by the language that opens it. */
        fun proseFence(opening: String): Boolean {
            val info = opening.dropWhile { it == '`' || it == '~' }.trimSpaces()
            return info.substringBefore(' ').lowercase() in proseLanguages
        }

        private fun isRule(trimmed: String): Boolean {
            if (trimmed.length < 3) return false
            val first = trimmed.first()
            return (first == '-' || first == '*' || first == '_') && trimmed.all { it == first }
        }

        private fun heading(trimmed: String): Pair<Int, String>? {
            val level = trimmed.takeWhile { it == '#' }.length.coerceAtMost(MAX_HEADING)
            if (level == 0) return null
            val rest = trimmed.substring(level)
            if (rest.isNotEmpty() && rest.first() != ' ') return null
            return level to rest.trimSpaces()
        }

        private fun listItem(line: String): Pair<Kind, String>? {
            val indent = line.takeWhile { it == ' ' || it == '\t' }.length
            val body = line.substring(indent)
            val depth = minOf(MAX_DEPTH, indent / 2)
            val first = body.firstOrNull() ?: return null
            if (first == '-' || first == '*' || first == '+') {
                if (body.getOrNull(1) != ' ') return null
                return Kind.ListItem("•", depth) to body.substring(1).trimSpaces()
            }
            val digits = body.takeWhile { it.isDigit() }
            if (digits.isEmpty()) return null
            val after = body.substring(digits.length)
            if (after.getOrNull(0) != '.' || after.getOrNull(1) != ' ') return null
            return Kind.ListItem("$digits.", depth) to after.substring(1).trimSpaces()
        }

        private fun String.trimSpaces(): String = trim(' ', '\t')

        private const val MAX_HEADING = 6
        private const val MAX_DEPTH = 3
    }
}
