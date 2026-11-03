package cx.lpm.mobile.feature.usage.usage

import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.resetShort
import kotlin.math.roundToLong

data class PickedWindow(
    val win: LimitWindow?,
    val label: String,
    val short: String,
    val windowMs: Double
)

/**
 * A tool's or account's use as of [now], as a usage row reads it (iOS `UsageReading`):
 * the weekly window — the one that actually runs out on people, and the desktop
 * sidebar's default — falling back to the 5-hour one, with the other one for the row's
 * lower lane. A window past its reset describes one that no longer exists and is left
 * out.
 */
class UsageReading(weekly: LimitWindow?, fiveHour: LimitWindow?, private val now: Double) {
    val main: PickedWindow
    val other: PickedWindow

    init {
        val week = PickedWindow(liveWindow(weekly, now), "weekly", "", WEEKLY_MS)
        val five = PickedWindow(liveWindow(fiveHour, now), "5-hour", "5h", FIVE_HOUR_MS)
        if (week.win != null) {
            main = week
            other = five
        } else {
            main = five
            other = week
        }
    }

    val hasWindow: Boolean get() = main.win != null

    /** The window's use as the tool reported it, 0 when it sent no figure; null without one. */
    val used: Double? get() = main.win?.let(::usedOf)

    val otherUsed: Double? get() = other.win?.let(::usedOf)

    /** How much of the bar is filled (0…1); null without a window. */
    val fraction: Double? get() = used?.let { it.coerceIn(0.0, 100.0) / 100 }

    /** How far through its window the clock is (0…1), where the pace tick sits. */
    val pace: Double?
        get() = computePace(main.win, main.windowMs, now)?.let { it.elapsedPercent / 100 }

    /** When the window comes back, as a bare duration; empty without one. */
    val reset: String get() = main.win?.let { resetShort(it.resetsAt, now) }.orEmpty()

    val percentText: String get() = used?.let { "${it.roundToLong()}%" }.orEmpty()
}

private fun usedOf(win: LimitWindow): Double =
    if (win.usedPercent.isFinite()) win.usedPercent else 0.0

private fun liveWindow(win: LimitWindow?, now: Double): LimitWindow? {
    win ?: return null
    return if (win.resetsAt > 0 && win.resetsAt * 1000.0 <= now) null else win
}
