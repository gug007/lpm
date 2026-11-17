package cx.lpm.mobile.feature.usage.stats

import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.UsageDaily
import cx.lpm.mobile.core.model.UsageSession
import cx.lpm.mobile.core.model.UsageTokens
import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.time.DateTimeException
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// Pure formatting and derivation for the Stats screen, ported from the desktop
// (`agentUsageFormat.ts`, `statsDerive.ts`) through iOS `StatsFormat.swift`, so the
// numbers match exactly.

/** `String(format: "%.Nf")`: the exact binary value, ties to even, no grouping. */
internal fun fixed(value: Double, digits: Int): String =
    BigDecimal(value).setScale(digits, RoundingMode.HALF_EVEN).toPlainString()

/** `Int.formatted()`: grouped in the phone's locale. */
internal fun grouped(value: Long): String = NumberFormat.getIntegerInstance().format(value)

/**
 * Compact token count: under 1K grouped, then `K` / `M` / `B` with one decimal while
 * the mantissa is small (the desktop's `formatTokenCount`).
 */
fun formatTokenCount(value: Long): String {
    val v = value.toDouble()
    return when {
        value < 1_000 -> grouped(value)
        value < 1_000_000 -> fixed(v / 1_000, if (value < 10_000) 1 else 0) + "K"
        value < 1_000_000_000 -> fixed(v / 1_000_000, if (value < 10_000_000) 1 else 0) + "M"
        else -> fixed(v / 1_000_000_000, if (value < 10_000_000_000) 1 else 0) + "B"
    }
}

/** A fraction (0…1) as a percent string; non-finite input reads as "0%". */
fun formatPercent(frac: Double, dp: Int = 0): String =
    if (frac.isFinite()) fixed(frac * 100, dp) + "%" else "0%"

/** The prose name for a selected period, used in "Nothing in …" copy. */
fun usagePeriodLabel(days: Int): String = when (days) {
    1 -> "today"
    0 -> "all time"
    else -> "the last $days days"
}

/** Parse a "YYYY-MM-DD" bucket (null on malformed input). */
fun parseUsageDate(date: String): LocalDate? {
    val parts = date.split("-")
    if (parts.size != 3) return null
    val (year, month, day) = parts.map { it.toIntOrNull() ?: return null }
    return try {
        LocalDate.of(year, month, day)
    } catch (_: DateTimeException) {
        null
    }
}

private val monthDay = DateTimeFormatter.ofPattern("MMM d")

/** A "YYYY-MM-DD" bucket rendered as e.g. "Jul 15". */
fun shortUsageDate(date: String): String = parseUsageDate(date)?.format(monthDay) ?: date

/** A day as the chart's axis labels it ("Oct 2"). */
internal fun LocalDate.monthDayLabel(): String = format(monthDay)

/** Share of input tokens served from cache (0…1). */
fun cacheShare(t: UsageTokens): Double = t.cachedInputTokens.toDouble() / maxOf(1L, t.inputTokens)

/** Share of output tokens spent on reasoning (0…1). */
fun reasoningShare(t: UsageTokens): Double =
    t.reasoningTokens.toDouble() / maxOf(1L, t.outputTokens)

/** The day with the most total tokens (null if every day is empty). */
fun mostActiveDay(daily: List<UsageDaily>): UsageDaily? {
    var peak: UsageDaily? = null
    for (day in daily) {
        if (day.totalTokens > 0 && (peak == null || day.totalTokens > peak.totalTokens)) peak = day
    }
    return peak
}

/** Count of distinct models seen across the given sessions. */
fun distinctModelCount(sessions: List<UsageSession>): Int = sessions.map { it.model }.toSet().size

/** The days the activity chart draws: all of them, or the last four weeks of all time. */
fun chartDays(stats: AgentStats, days: Int): List<UsageDaily> =
    if (days == 0) stats.daily.takeLast(ALL_TIME_CHART_DAYS) else stats.daily

private const val ALL_TIME_CHART_DAYS = 28

/**
 * A model's name without its maker's prefix, as the desktop's session list shows it:
 * "fable-5" for "claude-fable-5".
 */
fun shortModelName(model: String): String = if (model.startsWith(
        CLAUDE_PREFIX,
        ignoreCase = true
    )
) {
    model.drop(CLAUDE_PREFIX.length)
} else {
    model
}

private const val CLAUDE_PREFIX = "claude-"
