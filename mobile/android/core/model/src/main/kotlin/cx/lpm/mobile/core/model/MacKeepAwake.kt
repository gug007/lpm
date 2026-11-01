package cx.lpm.mobile.core.model

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import kotlin.math.ceil
import kotlin.math.max
import kotlinx.serialization.json.JsonObject

/**
 * Keep awake on the Mac (`keepAwake` in PROTOCOL.md): kept awake while agents work
 * and for a while after, for a set time, or until turned off. The same words as the
 * Mac's own menu (iOS `MacKeepAwake`).
 */
data class MacKeepAwake(
    val supported: Boolean,
    val mode: Mode,
    val active: Boolean,
    val agents: Int,
    /** Milliseconds until the set time or the after-agents countdown ends, as of arrival. */
    val endsIn: Long?,
    val tailMinutes: Int,
    val floor: Int,
    val power: Power
) {
    enum class Mode(val rawValue: String) {
        Off("off"),
        Agents("agents"),
        Timed("timed"),
        Always("always");

        companion object {
            fun of(rawValue: String?): Mode? = entries.firstOrNull { it.rawValue == rawValue }
        }
    }

    enum class Power(val rawValue: String) {
        Unsupported("unsupported"),
        Idle("idle"),
        Failed("failed"),
        Awake("awake"),
        Battery("battery"),
        Low("low");

        companion object {
            fun of(rawValue: String?): Power =
                entries.firstOrNull { it.rawValue == rawValue } ?: Idle
        }
    }

    /** Holding now. */
    val isOn: Boolean get() = mode != Mode.Off && active

    /** The short text beside the Mac's name: "2 agents", "4:32", "On". */
    fun badge(leftSeconds: Double?): String? = when (mode) {
        Mode.Off -> null

        Mode.Agents -> when {
            agents > 0 -> if (agents == 1) "1 agent" else "$agents agents"
            else -> leftSeconds?.let(::clock) ?: "Agents"
        }

        Mode.Timed -> clock(leftSeconds ?: 0.0)

        Mode.Always -> "On"
    }

    /** What holds and until when. */
    fun line(leftSeconds: Double?, now: Instant, zone: ZoneId): String = when (mode) {
        Mode.Off -> "Sleeps on its usual schedule."

        Mode.Agents -> when {
            agents > 0 -> {
                val working = if (agents == 1) "1 agent working." else "$agents agents working."
                if (tailMinutes > 0) {
                    "$working Stays awake ${span(tailMinutes)} after the last one finishes."
                } else {
                    "$working Can sleep as soon as the last one finishes."
                }
            }

            leftSeconds != null ->
                "Agents finished. Can sleep in ${clock(leftSeconds)} unless another one starts."

            else -> "No agent is working. Stays awake when the next one starts."
        }

        Mode.Timed -> {
            val left = leftSeconds ?: 0.0
            val until = DateTimeFormatter.ofLocalizedTime(FormatStyle.SHORT).withZone(zone)
                .format(now.plusMillis((left * 1000).toLong()))
            "Awake until $until · ${span(ceil(left / 60).toInt())} left."
        }

        Mode.Always -> "Awake until you turn it off."
    }

    /** Why it isn't held right now although a mode is on. */
    fun powerNote(macName: String): String? {
        if (mode == Mode.Off) return null
        return when (power) {
            Power.Battery ->
                "On battery, so $macName can sleep. Turn on “On battery too” on the Mac to keep it awake."

            Power.Low -> "Battery at $floor% or less, so $macName can sleep."

            Power.Failed -> "Couldn't keep $macName awake. Turn it off and on to try again."

            else -> null
        }
    }

    companion object {
        val PRESETS = listOf(30, 60, 120, 240, 480)

        fun parse(o: JsonObject): MacKeepAwake? {
            val mode = Mode.of(o.string("mode")) ?: return null
            return MacKeepAwake(
                supported = o.bool("supported") ?: true,
                mode = mode,
                active = o.bool("active") ?: false,
                agents = o.int("agents") ?: 0,
                endsIn = o.long("endsIn"),
                tailMinutes = o.int("tailMinutes") ?: 5,
                floor = o.int("floor") ?: 20,
                power = Power.of(o.string("power"))
            )
        }

        /** "4:32" or "1:29:58", rounded up so it reads 0:01 until the very end. */
        fun clock(seconds: Double): String {
            val total = max(0, ceil(seconds).toInt())
            val h = total / 3600
            val m = (total % 3600) / 60
            val s = total % 60
            return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
        }

        /** "45 min", "2 h", "1 h 30 min". */
        fun span(minutes: Int): String {
            val h = minutes / 60
            val m = minutes % 60
            if (h == 0) return "$m min"
            return if (m == 0) "$h h" else "$h h $m min"
        }

        /** A preset's menu title: "For 30 Minutes", "For 2 Hours". */
        fun presetTitle(minutes: Int): String {
            if (minutes < 60) return "For $minutes Minutes"
            val h = minutes / 60
            return if (h == 1) "For 1 Hour" else "For $h Hours"
        }
    }
}
