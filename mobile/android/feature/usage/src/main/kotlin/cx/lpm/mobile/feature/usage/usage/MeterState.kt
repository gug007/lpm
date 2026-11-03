package cx.lpm.mobile.feature.usage.usage

import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.durationShort
import cx.lpm.mobile.core.model.resetText
import kotlin.math.roundToLong

/** How a window's verdict is tinted. */
enum class VerdictTone { Secondary, Good, Warning, Critical }

/** Everything one window meter shows, worked out from its reading and the clock. */
data class MeterState(
    val hasData: Boolean,
    val shown: Long,
    val verdict: String,
    val verdictTone: VerdictTone,
    val barFraction: Double,
    /** Where the pace tick sits (0…1), or null when there's nothing to judge yet. */
    val tick: Double?,
    val resetLine: String,
    val runsOut: String,
    val accessibilityValue: String
)

/**
 * A bare "62% used" means nothing on its own, so the percentage is judged against how
 * much of the window has already burned down (the desktop `UsageMeter`).
 */
fun meterState(win: LimitWindow?, windowMs: Double, now: Double): MeterState {
    val pace = computePace(win, windowMs, now)
    val expired = pace?.expired ?: false
    // Past its reset the last reading describes a window that no longer exists, so it
    // reads as absent rather than as a number to act on.
    val hasData = win != null && !expired

    val used = win?.usedPercent ?: 0.0
    val raw = if (used.isFinite()) used else 0.0
    val shown = maxOf(0.0, raw).roundToLong()
    val resetsAt = win?.resetsAt ?: 0

    var tick: Double? = null
    var elapsedPercent = 0L
    var runsOut = ""
    if (pace != null) {
        elapsedPercent = pace.elapsedPercent.roundToLong()
        if (hasData && pace.verdict != PaceVerdict.Early && pace.verdict != PaceVerdict.Unknown) {
            tick = (pace.elapsedPercent / 100).coerceIn(0.0, 1.0)
        }
        val exhaustsInMs = pace.exhaustsInMs
        if (hasData && pace.verdict == PaceVerdict.Over && exhaustsInMs != null) {
            runsOut = "runs out in ~${durationShort(exhaustsInMs)}, before reset"
        }
    }

    val verdict = if (expired) "window reset · awaiting new data" else paceLabel(pace)
    val resetSoon = if (resetsAt > 0) resetText(resetsAt, now) else ""
    val resetLine = if (hasData && resetsAt > 0) "$resetSoon · ${resetAbsolute(resetsAt)}" else ""

    val spoken = when {
        hasData -> listOf(
            "$shown% used",
            verdict,
            if (tick != null) "$elapsedPercent% of the window elapsed" else "",
            resetSoon,
            runsOut
        ).filter { it.isNotEmpty() }.joinToString(", ")

        expired -> "window reset, awaiting new data"

        else -> "no data yet"
    }

    return MeterState(
        hasData = hasData,
        shown = shown,
        verdict = verdict,
        verdictTone = when {
            expired || pace == null -> VerdictTone.Secondary
            pace.verdict == PaceVerdict.Exhausted -> VerdictTone.Critical
            pace.verdict == PaceVerdict.Over -> VerdictTone.Warning
            pace.verdict == PaceVerdict.Under -> VerdictTone.Good
            else -> VerdictTone.Secondary
        },
        barFraction = if (hasData) raw.coerceIn(0.0, 100.0) / 100 else 0.0,
        tick = tick,
        resetLine = resetLine,
        runsOut = runsOut,
        accessibilityValue = spoken
    )
}
