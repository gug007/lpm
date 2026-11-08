package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.put

/** Notes: per-project chats of notes with attachments. */
sealed interface WireNotes {
    fun notesChats(project: String): String = frame("notesChats") { put("project", project) }

    fun notesCreateChat(project: String, title: String): String = frame("notesCreateChat") {
        put("project", project)
        put("title", title)
    }

    fun notesRenameChat(project: String, chatId: String, title: String): String =
        frame("notesRenameChat") {
            put("project", project)
            put("chatId", chatId)
            put("title", title)
        }

    fun notesDeleteChat(project: String, chatId: String): String = frame("notesDeleteChat") {
        put("project", project)
        put("chatId", chatId)
    }

    /**
     * One page, newest first. `beforeId` is the oldest id already held ("" for the
     * first page) and is echoed on the reply so a late page can be dropped.
     */
    fun notesMessages(project: String, chatId: String, limit: Int, beforeId: String): String =
        frame("notesMessages") {
            put("project", project)
            put("chatId", chatId)
            put("limit", limit)
            put("beforeId", beforeId)
        }

    /**
     * Post a note. Each attachment is `{ name, mimeType, data }` with `data` as padded
     * base64 of the raw bytes. The Mac refuses anything over 8MiB — the limit is the
     * WebSocket frame, not the disk. The share sheet tags its note with a `reqId`.
     */
    fun notesAddMessage(
        project: String,
        chatId: String,
        text: String,
        attachments: List<JsonObject>,
        reqId: String? = null
    ): String = frame("notesAddMessage") {
        put("project", project)
        put("chatId", chatId)
        put("text", text)
        put("attachments", JsonArray(attachments))
        putNonEmpty("reqId", reqId)
    }

    fun notesEditMessage(project: String, id: String, text: String): String =
        frame("notesEditMessage") {
            put("project", project)
            put("id", id)
            put("text", text)
        }

    fun notesDeleteMessage(project: String, id: String): String = frame("notesDeleteMessage") {
        put("project", project)
        put("id", id)
    }

    /**
     * Substring search across the project's notes. `query` is echoed back, so a reply
     * from a superseded keystroke can be dropped.
     */
    fun notesSearch(project: String, query: String, limit: Int): String = frame("notesSearch") {
        put("project", project)
        put("query", query)
        put("limit", limit)
    }

    fun notesAttachment(project: String, hash: String): String = frame("notesAttachment") {
        put("project", project)
        put("hash", hash)
    }
}
