package cx.lpm.mobile.core.model

import kotlin.math.roundToLong

/**
 * When a window turns over, as a bare duration ("4d 10h", "now"); empty when the tool
 * did not say. The desktop sidebar's `resetDurationShort`.
 */
fun resetShort(resetsAt: Long, now: Double): String =
    if (resetsAt == 0L) "" else durationShort(resetsAt * 1000.0 - now)

/** "resets in 2h 30m" / "resets now"; empty when the turnover time is unknown. */
fun resetText(resetsAt: Long, now: Double): String {
    if (resetsAt == 0L) return ""
    val delta = resetsAt * 1000.0 - now
    return if (delta <= 0) "resets now" else "resets in ${durationShort(delta)}"
}

/**
 * A span in coarse buckets: "1m", "2h 10m", "2d 2h". Anything under a minute still
 * reads as a minute, so a live countdown never shows "0m".
 */
fun durationShort(ms: Double): String {
    if (!ms.isFinite() || ms <= 0) return "now"
    val mins = (ms / 60_000).roundToLong()
    if (mins < 60) return "${maxOf(1L, mins)}m"
    val hours = mins / 60
    val remMins = mins % 60
    if (hours < 24) return if (remMins != 0L) "${hours}h ${remMins}m" else "${hours}h"
    val days = hours / 24
    val remHours = hours % 24
    return if (remHours != 0L) "${days}d ${remHours}h" else "${days}d"
}
