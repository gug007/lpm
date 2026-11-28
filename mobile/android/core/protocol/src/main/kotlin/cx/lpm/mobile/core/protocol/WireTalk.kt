package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.TalkPlan
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject

/** The Talk button's requests. Only for a Mac whose `features` has "talk". */
sealed interface WireTalk {
    fun talkPlan(reqId: String, text: String): String = frame("talkPlan") {
        put("reqId", reqId)
        put("text", text)
    }

    fun talkRun(reqId: String, plan: TalkPlan): String = frame("talkRun") {
        put("reqId", reqId)
        putJsonObject("plan") {
            put("project", plan.project)
            put("where", plan.place.wire)
            put("agent", plan.agent)
            put("prompt", plan.prompt)
            put("label", plan.label)
        }
    }
}
