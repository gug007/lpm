package cx.lpm.mobile.feature.usage.usage

import cx.lpm.mobile.core.model.LimitWindow
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.roundToLong

// Pure pace math and formatting for the Usage screen, the desktop's
// `components/stats/limitsFormat.ts` through iOS `UsageFormat.swift`.
//
// Every `now` here is unix MILLIS. `resetsAt` arrives as unix SECONDS and is converted
// inside these helpers, so callers pass the wire value untouched.

/**
 * A reading older than this is shown dimmed: the tool has stopped reporting, so the
 * percentages describe the past rather than the present.
 */
const val STALE_MS = 15.0 * 60 * 1000

// The Mac slots a reading strictly by window length, so the lengths are fixed here
// and never travel on the wire.
const val FIVE_HOUR_MS = 5.0 * 60 * 60 * 1000
const val WEEKLY_MS = 7.0 * 24 * 60 * 60 * 1000

enum class PaceVerdict { Unknown, Early, Under, On, Over, Exhausted }

data class Pace(
    val expired: Boolean,
    val elapsedPercent: Double,
    val ratio: Double,
    val verdict: PaceVerdict,
    val exhaustsInMs: Double?
)

private const val OVER_RATIO = 1.15
private const val UNDER_RATIO = 0.85
private const val MIN_ELAPSED_PERCENT = 5.0

/**
 * A raw "60% used" says nothing without knowing how much of the window has burned
 * down, so every percentage is judged against elapsed wall-clock time.
 */
fun computePace(win: LimitWindow?, windowMs: Double, now: Double): Pace? {
    if (win == null || win.resetsAt == 0L || windowMs <= 0) return null

    val resetsAtMs = win.resetsAt * 1000.0
    val expired = resetsAtMs <= now
    val elapsedMs = maxOf(0.0, minOf(windowMs, windowMs - (resetsAtMs - now)))
    val elapsedPercent = elapsedMs / windowMs * 100

    val usedPercent = win.usedPercent
    if (!usedPercent.isFinite()) {
        return Pace(expired, elapsedPercent, 0.0, PaceVerdict.Unknown, null)
    }

    val ratio = if (elapsedPercent > 0) usedPercent / elapsedPercent else 0.0
    val verdict = when {
        usedPercent >= 100 -> PaceVerdict.Exhausted
        elapsedPercent < MIN_ELAPSED_PERCENT -> PaceVerdict.Early
        ratio > OVER_RATIO -> PaceVerdict.Over
        ratio < UNDER_RATIO -> PaceVerdict.Under
        else -> PaceVerdict.On
    }

    // Only worth saying when the burn actually lands before the window turns over —
    // otherwise the window resets first and nothing runs out.
    var exhaustsInMs: Double? = null
    val rate = if (elapsedMs > 0) usedPercent / elapsedMs else 0.0
    if (rate > 0 && usedPercent < 100) {
        val msToFull = (100 - usedPercent) / rate
        if (msToFull.isFinite() && now + msToFull < resetsAtMs) exhaustsInMs = msToFull
    }

    return Pace(expired, elapsedPercent, ratio, verdict, exhaustsInMs)
}

/** The verdict in words; empty when there is nothing worth judging yet. */
fun paceLabel(pace: Pace?): String = when (pace?.verdict) {
    PaceVerdict.Over -> "too fast"
    PaceVerdict.Under -> "will last"
    PaceVerdict.On -> "on pace"
    PaceVerdict.Exhausted -> "limit reached"
    else -> ""
}

/** The turnover time as a date ("Oct 19 at 8:55 PM"), in the phone's time zone. */
fun resetAbsolute(resetsAt: Long, zone: ZoneId = ZoneId.systemDefault()): String {
    if (resetsAt == 0L) return ""
    val at = Instant.ofEpochSecond(resetsAt).atZone(zone)
    return at.format(DateTimeFormatter.ofPattern("MMM d")) + " at " +
        at.format(DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT))
}

/** How long ago the tool last reported. `updatedAt` is unix MILLIS. */
fun updatedText(updatedAt: Long, now: Double): String {
    val mins = ((now - updatedAt) / 60_000).roundToLong()
    if (mins < 1) return "updated just now"
    if (mins < 60) return "updated ${mins}m ago"
    val hours = (mins / 60.0).roundToLong()
    if (hours < 24) return "updated ${hours}h ago"
    return "updated ${(hours / 24.0).roundToLong()}d ago"
}
