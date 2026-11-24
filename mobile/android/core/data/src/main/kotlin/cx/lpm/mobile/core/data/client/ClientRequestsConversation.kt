package cx.lpm.mobile.core.data.client

import cx.lpm.mobile.core.protocol.Wire

// An agent tab's conversation. Live like a subscription: a frame is worth nothing on a
// later link, which asks again.

fun LpmClient.requestAnswers(id: String, project: String, limit: Int, reqId: String) =
    sendLive(Wire.answers(id, project, limit, reqId))

fun LpmClient.watchConversation(id: String, project: String) =
    sendLive(Wire.conversationWatch(id, project))

fun LpmClient.unwatchConversation(id: String) = sendLive(Wire.conversationUnwatch(id))

fun LpmClient.requestConversationPage(id: String, project: String, before: String, reqId: String) =
    sendLive(Wire.conversationPage(id, project, before, reqId))

fun LpmClient.requestConversationDetail(id: String, project: String, item: String, reqId: String) =
    sendLive(Wire.conversationDetail(id, project, item, reqId))
