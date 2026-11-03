package cx.lpm.mobile.feature.automations.format

import cx.lpm.mobile.core.model.AutomationJob
import java.text.BreakIterator

/** The results a run ends in when it failed; their dot is red. */
val automationFailedResults: Set<String> = setOf("error", "timed-out", "context-full")

/**
 * The last run failed, and nothing about the job matters more right now: it's valid,
 * enabled, not running and not waiting on an answer. Its row says why, Run reads
 * "Retry", and the list's Failed filter keeps it.
 */
fun automationLastRunFailed(job: AutomationJob): Boolean = job.valid &&
    job.ask == null &&
    !job.running &&
    job.enabled &&
    job.lastResult in automationFailedResults

/**
 * A failed row says how long the run went and why it stopped, as the desktop does:
 * "Problem during the run after 1m 1s · The check couldn't run: …".
 */
fun automationFailureText(job: AutomationJob): String {
    var text = automationResultLabel(job.lastResult)
    job.lastDurationSecs?.takeIf { it > 0 }?.let { text += " after ${automationRunLengthText(it)}" }
    val note = automationNoteLine(job.lastNote)
    return if (note.isEmpty()) text else "$text · $note"
}

/** "12s", "4m", "4m 30s", "1h 12m", "1h" — how long a run took. */
fun automationRunLengthText(secs: Int): String {
    if (secs < SECONDS_IN_MINUTE) return "${maxOf(0, secs)}s"
    val mins = secs / SECONDS_IN_MINUTE
    if (mins < MINUTES_IN_HOUR) {
        val rest = secs % SECONDS_IN_MINUTE
        return if (rest > 0) "${mins}m ${rest}s" else "${mins}m"
    }
    val rest = mins % MINUTES_IN_HOUR
    val hours = mins / MINUTES_IN_HOUR
    return if (rest > 0) "${hours}h ${rest}m" else "${hours}h"
}

/**
 * A run's words on one line: citation markers, code blocks and markdown markers
 * dropped, links reduced to their text, whitespace collapsed, and cut at [max]
 * characters.
 */
fun automationNoteLine(text: String, max: Int = NOTE_MAX): String {
    val flat = noteRules.fold(text) { acc, (pattern, replacement) ->
        pattern.replace(acc, replacement)
    }.trim(Char::isSwiftWhitespace)
    return flat.truncated(max)
}

private val noteRules = listOf(
    Regex("[ \\t]*\\uE200[^\\uE201]*\\uE201") to "",
    Regex("[\\uE200-\\uE2FF]") to "",
    Regex("```[\\s\\S]*?(```|$)") to " ",
    Regex("\\[([^\\]]*)\\]\\([^)]*\\)") to "$1",
    Regex("[#*_>`|]") to "",
    Regex("[\\s\\p{Z}\\u0085]+") to " "
)

/** Swift's `.whitespaces`: tab and Unicode space separators. */
private fun Char.isSwiftWhitespace() =
    this == '\t' || Character.getType(this) == Character.SPACE_SEPARATOR.toInt()

/** The first [max] characters (grapheme clusters, as Swift counts) and "…" when longer. */
private fun String.truncated(max: Int): String {
    val boundaries = BreakIterator.getCharacterInstance().also { it.setText(this) }
    boundaries.first()
    repeat(max) { if (boundaries.next() == BreakIterator.DONE) return this }
    val end = boundaries.current()
    if (end >= length) return this
    return substring(0, end).trim(Char::isSwiftWhitespace) + "…"
}

private const val NOTE_MAX = 240
private const val SECONDS_IN_MINUTE = 60
private const val MINUTES_IN_HOUR = 60
