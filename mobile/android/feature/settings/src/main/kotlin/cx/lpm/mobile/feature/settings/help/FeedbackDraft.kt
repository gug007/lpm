package cx.lpm.mobile.feature.settings.help

/**
 * What kind of feedback the text reads like (iOS `FeedbackKind`). Bugs are work to
 * track, so they become issues; ideas and questions are a conversation others can
 * join, so they become discussions.
 */
enum class FeedbackKind { Bug, Suggestion, Question }

/** The feedback box as the desktop's feedbackDraft.ts reads it (iOS `FeedbackDraft`). */
object FeedbackDraft {
    private const val REPO = "https://github.com/gug007/lpm"
    private const val TITLE_MAX = 80

    private val bug = listOf(
        """\b(bug|crash(es|ed|ing)?|errors?|exceptions?|broken|fail(s|ed|ing|ure)?|freez(e|es|ing)|froze|frozen|hangs?|hanging|stuck|glitch(es|y)?|regression)\b""",
        """\b(doesn't|does not|don't|do not|didn't|did not|won't|will not|can't|cannot|isn't|is not|not|stopped) (work|working|load|loading|open|opening|start|starting|show|showing|save|saving|respond|responding)\b""",
        """\bnothing happens\b"""
    ).map(::Regex)
    private val suggestion = listOf(
        """\b(could|would) (it|you|lpm|we|there)\b""",
        """\b(would|it'd) be (nice|great|cool|useful|helpful|handy)\b""",
        """\b(i'd|i would) (like|love)\b""",
        """\b(add|support|allow|let me)\b""",
        """\b(wish|suggest|suggestion|idea|feature request)\b""",
        """\b(an option|a setting|a button|a shortcut) (to|for)\b"""
    ).map(::Regex)
    private val question = listOf(
        """^(how|what|why|where|when|which|who|is there|are there|can i|do i|does|is it|should i)\b""",
        """\bhow (do|can|to|does)\b""",
        """\bis (it|there) (possible|a way)\b"""
    ).map(::Regex)

    private val firstSentence = Regex("""^.*?[.!?](?=\s|$)""")
    private val trailingPunctuation = Regex("""[\s,;:–-]+$""")

    private fun hits(patterns: List<Regex>, text: String): Double =
        patterns.count { it.containsMatchIn(text) }.toDouble()

    /**
     * The kind the text most reads like, or null while there's nothing to read. A
     * question mark alone counts for less than a word; ties go to bug, then idea.
     */
    fun guessKind(text: String): FeedbackKind? {
        val normalized = text.trim().lowercase().replace('‘', '\'').replace('’', '\'')
        if (normalized.isEmpty()) return null
        val b = hits(bug, normalized)
        val s = hits(suggestion, normalized)
        val q = hits(question, normalized) + if ('?' in normalized) 0.5 else 0.0
        return when {
            b == 0.0 && s == 0.0 && q == 0.0 -> FeedbackKind.Suggestion
            b >= s && b >= q -> FeedbackKind.Bug
            s >= q -> FeedbackKind.Suggestion
            else -> FeedbackKind.Question
        }
    }

    /** The first sentence of the first line, cut at a word near 80 characters. */
    fun title(text: String): String {
        val line = text.trim().split("\n").first().trim()
        var sentence = firstSentence.find(line)?.value ?: line
        if (sentence.endsWith(".")) sentence = sentence.dropLast(1)
        if (sentence.length <= TITLE_MAX) return sentence
        val cut = sentence.take(TITLE_MAX + 1)
        val space = cut.lastIndexOf(' ')
        val head = if (space > TITLE_MAX / 2) cut.substring(0, space) else sentence.take(TITLE_MAX)
        return head.replace(trailingPunctuation, "") + "…"
    }

    /** The new issue or discussion on lpm's repository, filled in. */
    fun url(kind: FeedbackKind, title: String, body: String): String {
        val query = buildList {
            if (kind == FeedbackKind.Suggestion) add("category=ideas")
            if (kind == FeedbackKind.Question) add("category=q-a")
            add("title=" + encode(title))
            add("body=" + encode(body))
            if (kind == FeedbackKind.Bug) add("labels=bug")
        }
        val path = if (kind == FeedbackKind.Bug) "/issues/new?" else "/discussions/new?"
        return REPO + path + query.joinToString("&")
    }

    /**
     * Everything but the unreserved characters escaped, `+` included, which GitHub would
     * read as a space.
     */
    private fun encode(value: String): String = buildString {
        for (byte in value.toByteArray(Charsets.UTF_8)) {
            val c = (byte.toInt() and 0xFF).toChar()
            if (c in 'a'..'z' || c in 'A'..'Z' || c in '0'..'9' || c in "-._~") {
                append(c)
            } else {
                append('%').append("%02X".format(byte.toInt() and 0xFF))
            }
        }
    }
}
