package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.TalkPlan
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings

/**
 * One `talkPlan` reply: the plan, or why there is none. [unsupported] marks a request
 * a plan can't carry out, as opposed to a failure worth another try.
 */
data class TalkPlanReply(
    val reqId: String,
    val plan: TalkPlan?,
    val candidates: List<String>,
    val error: String,
    val unsupported: Boolean
) : Inbound

/** One `talkRun` reply. [error] is null once the Mac has started the plan. */
data class TalkRunReply(val reqId: String, val error: String?) : Inbound

private const val REFUSED = "The Mac couldn't do it."

internal val talkParsers = parsers {
    put("talkPlan") { o ->
        TalkPlanReply(
            reqId = o.str("reqId"),
            plan = if (o.ok) o.obj("plan")?.let(TalkPlan::parse) else null,
            candidates = o.strings("candidates").orEmpty(),
            error = o.string("error") ?: REFUSED,
            unsupported = !o.ok && o.bool("unsupported") == true
        )
    }
    put("talkRun") { o -> TalkRunReply(reqId = o.str("reqId"), error = o.failure(REFUSED)) }
}
