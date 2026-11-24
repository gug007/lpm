package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.put

/** An agent tab's conversation. Only for a Mac whose `features` has "agentConversation". */
sealed interface WireConversation {
    /** Its newest answers, from a Mac with "agentAnswers". */
    fun answers(id: String, project: String, limit: Int, reqId: String): String = frame("answers") {
        put("id", id)
        put("project", project)
        put("limit", limit)
        put("reqId", reqId)
    }

    fun conversationWatch(id: String, project: String): String = frame("conversationWatch") {
        put("id", id)
        put("project", project)
    }

    fun conversationUnwatch(id: String): String = frame("conversationUnwatch") { put("id", id) }

    fun conversationPage(id: String, project: String, before: String, reqId: String): String =
        frame("conversationPage") {
            put("id", id)
            put("project", project)
            put("before", before)
            put("reqId", reqId)
        }

    fun conversationDetail(id: String, project: String, item: String, reqId: String): String =
        frame("conversationDetail") {
            put("id", id)
            put("project", project)
            put("item", item)
            put("reqId", reqId)
        }
}
