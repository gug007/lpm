package cx.lpm.mobile.core.model

import kotlin.math.roundToLong
import kotlinx.serialization.json.JsonObject

/**
 * Why a Claude tab stopped, as the Mac lists it with the terminal (iOS `LimitStop`): its
 * account's limit, the account put on hold, or one model's weekly limit; and where the
 * conversation can go on. Worded as the desktop's bar words it.
 */
data class LimitStop(
    /** "limit", "hold" or "model". */
    val kind: String,
    val account: String,
    val accountLabel: String,
    /** "fiveHour" or "weekly", with "limit". */
    val window: String?,
    val model: String?,
    /** Unix seconds; 0 when unknown or for a hold. */
    val resetsAt: Long,
    val offer: Offer?,
    val firstFree: FirstFree?
) {
    data class Offer(
        val account: String,
        val label: String,
        val fiveHour: Double?,
        val weekly: Double?,
        /** Every account with room is close to a limit; this one has the most. */
        val near: Boolean
    )

    data class FirstFree(val account: String, val label: String, val resetsAt: Long)

    /** "Main login hit its weekly limit", "Main login was put on hold". */
    val headline: String
        get() = when (kind) {
            "hold" -> "$accountLabel was put on hold"

            "model" -> "$accountLabel hit its weekly ${model ?: "model"} limit"

            else -> {
                val name = if (window == "fiveHour") "5-hour" else "weekly"
                "$accountLabel hit its $name limit"
            }
        }

    /** "resets in 2d 14h"; empty for a hold or an unknown reset. `now` is unix millis. */
    fun reset(now: Double): String = resetText(resetsAt, now)

    /** Where the conversation can go, or why it can't. */
    fun detail(now: Double): String = when (kind) {
        "hold" -> HOLD_DETAIL

        "model" -> "This account still works with other models. Type /model to switch."

        else -> offer?.let { offer ->
            val room = if (offer.near) "has the most room" else "has room"
            val used = listOf(
                "5-hour" to offer.fiveHour,
                "weekly" to offer.weekly
            ).mapNotNull { (name, pct) ->
                pct?.let { "$name ${it.roundToLong()}%" }
            }
            (listOf("${offer.label} $room") + used).joinToString(" · ")
        } ?: firstFree?.let { first ->
            val span = resetShort(first.resetsAt, now)
            val wait = if (span == "now") "now" else "in $span"
            if (span.isEmpty()) {
                "Every account is at a limit."
            } else {
                "Every account is at a limit. ${first.label} resets first, $wait."
            }
        } ?: "No other account in your list has room."
    }

    /** A limit or model stop is over once its window resets; a hold, with no reset, lasts. */
    fun holds(now: Double): Boolean = resetsAt == 0L || resetsAt * 1000.0 > now

    companion object {
        fun parse(o: JsonObject?): LimitStop? {
            val kind = o?.string("kind")?.takeIf { it.isNotEmpty() } ?: return null
            return LimitStop(
                kind = kind,
                account = o.string("account").orEmpty(),
                accountLabel = o.string("accountLabel").orEmpty(),
                window = o.string("window"),
                model = o.string("model"),
                resetsAt = o.numberLong("resetsAt") ?: 0,
                offer = o.obj("offer")?.let { f ->
                    val account = f.string("account")?.takeIf { it.isNotEmpty() } ?: return@let null
                    Offer(
                        account = account,
                        label = f.string("label") ?: account,
                        fiveHour = f.number("fiveHour"),
                        weekly = f.number("weekly"),
                        near = f.bool("near") ?: false
                    )
                },
                firstFree = o.obj("firstFree")?.let { f ->
                    val account = f.string("account")?.takeIf { it.isNotEmpty() } ?: return@let null
                    FirstFree(account, f.string("label") ?: account, f.numberLong("resetsAt") ?: 0)
                }
            )
        }
    }
}

private const val HOLD_DETAIL = "Account switching is paused. " +
    "Conversations stay on their account until you turn switching back on."
