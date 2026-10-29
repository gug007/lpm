package cx.lpm.mobile.core.data.push

import java.time.LocalTime

/**
 * Hours in which notifications arrive quietly: in the shade, without a sound or a
 * heads-up (iOS `QuietHours`). An agent waiting on the user can still come through.
 */
data class QuietHours(
    val enabled: Boolean = false,
    /** Minutes after midnight, in the phone's own time zone. */
    val start: Int = 22 * 60,
    val end: Int = 7 * 60 + 30,
    val letWaitingThrough: Boolean = true
) {
    /** Whether [minute] falls in the quiet hours; a span past midnight wraps, equal ends mean all day. */
    fun covers(minute: Int): Boolean {
        if (!enabled) return false
        if (start == end) return true
        return if (start < end) minute in start until end else minute >= start || minute < end
    }

    /**
     * Whether a notification about [status] arrives quietly at [time]. An agent waiting
     * ("Waiting") and an automation asking ("Waiting for your answer · …") both need the user.
     */
    fun quiets(status: String, time: LocalTime): Boolean {
        if (letWaitingThrough && status.startsWith("Waiting")) return false
        return covers(time.hour * 60 + time.minute)
    }
}
