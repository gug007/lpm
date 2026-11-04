package cx.lpm.mobile.core.data.dictation

/** This draft with a take's words after it, spaced the way typing them would be. */
fun String.plusDictated(words: String): String =
    if (isEmpty() || endsWith(" ") || endsWith("\n")) this + words else "$this $words"

/**
 * What one take has heard. Android's recognizer ends at every pause, so a take is
 * a run of recognitions: each one's result settles, and the current one's partial
 * text stands in until then, or for good if the take stops first.
 */
internal class DictationWords {
    private val settled = mutableListOf<String>()
    private var live = ""

    val text: String
        get() = (settled + live).filter { it.isNotBlank() }.joinToString(" ") { it.trim() }

    fun hear(partial: String) {
        if (partial.isNotBlank()) live = partial
    }

    /** A recognition ended, with its result if it had one. */
    fun settle(result: String?) {
        val words = result?.takeIf { it.isNotBlank() } ?: live
        if (words.isNotBlank()) settled += words
        live = ""
    }
}
