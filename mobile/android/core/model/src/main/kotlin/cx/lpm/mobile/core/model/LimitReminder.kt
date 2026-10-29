package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * A reminder that a usage limit has reset, kept by the Mac for its desktop and
 * every phone (iOS `LimitReminder`). `limit` is the snapshot's key ("codex",
 * "claude:<account>"), `window` is "fiveHour" or "weekly", `resetsAt` unix seconds.
 */
data class LimitReminder(
    val limit: String,
    val window: String,
    val resetsAt: Long,
    val name: String
) {
    companion object {
        const val FIVE_HOUR = "fiveHour"
        const val WEEKLY = "weekly"

        /** Usage from which a window offers the reminder. */
        const val REMIND_FROM_PERCENT = 80.0

        fun parse(o: JsonObject): LimitReminder? {
            val limit = o.string("limit") ?: return null
            val window = o.string("window") ?: return null
            return LimitReminder(
                limit = limit,
                window = window,
                resetsAt = o.numberLong("resetsAt") ?: 0,
                name = o.string("name").orEmpty()
            )
        }

        /** A live reading near or at its limit, or one that already has a reminder. */
        fun remindable(win: LimitWindow?, nowMs: Double, set: Boolean): Boolean {
            if (win == null || win.resetsAt <= 0 || win.resetsAt * 1000.0 <= nowMs) return false
            return set || win.usedPercent >= REMIND_FROM_PERCENT
        }
    }
}
