package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ConversationPage
import cx.lpm.mobile.core.model.ConversationPart
import cx.lpm.mobile.core.model.ConversationUpdate
import cx.lpm.mobile.core.model.objects
import cx.lpm.mobile.core.model.string

/** A watched conversation: its newest entries, then what changes. */
data class ConversationPush(val update: ConversationUpdate) : Inbound

/** The entries before one; [page] null when the Mac refused. */
data class ConversationPageReply(val reqId: String, val page: ConversationPage?) : Inbound

/** What a tool call was given and what came back; [parts] null when the Mac refused. */
data class ConversationDetailReply(
    val reqId: String,
    val parts: List<ConversationPart>?,
    val error: String?
) : Inbound

/** An agent tab's newest answer; null when the Mac refused or it has none. */
data class AnswersReply(val reqId: String, val newest: String?) : Inbound

internal val conversationParsers = parsers {
    put("answers") { o ->
        AnswersReply(
            reqId = Wire.reqIdString(o["reqId"]),
            newest = o.objects("answers")?.firstOrNull()?.string("text")?.takeIf { o.ok }
        )
    }
    put("conversation") { o -> ConversationPush(ConversationUpdate.parse(o)) }
    put("conversationPage") { o ->
        ConversationPageReply(
            reqId = Wire.reqIdString(o["reqId"]),
            page = if (o.ok) ConversationPage.parse(o) else null
        )
    }
    put("conversationDetail") { o ->
        ConversationDetailReply(
            reqId = Wire.reqIdString(o["reqId"]),
            parts = if (o.ok) {
                o.objects("parts").orEmpty().map(ConversationPart::parse)
            } else {
                null
            },
            error = o.failure("Couldn't read this step.")
        )
    }
}
