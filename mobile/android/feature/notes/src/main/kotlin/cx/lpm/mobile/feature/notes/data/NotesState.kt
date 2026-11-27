package cx.lpm.mobile.feature.notes.data

import cx.lpm.mobile.core.model.NoteChat
import cx.lpm.mobile.core.model.NoteMessage

/** Keys a chat or a note within a project: `project + "\n" + id`. */
fun notesKey(project: String, id: String): String = project + "\n" + id

/**
 * Notes for every project. Chat-level maps are keyed by project (a create, too) or by
 * [notesKey] of the chat; note-level maps by [notesKey] of the note.
 */
data class NotesState(
    /** Most recently updated first. */
    val chats: Map<String, List<NoteChat>> = emptyMap(),
    val chatsLoaded: Set<String> = emptySet(),
    val chatsLoading: Set<String> = emptySet(),
    val chatsError: Map<String, String> = emptyMap(),
    /** A create in flight (by project) or a rename/delete (by chat key). */
    val chatMutating: Set<String> = emptySet(),
    /** Chat create/rename/delete failures, by project. */
    val chatError: Map<String, String> = emptyMap(),
    /** One-shot: the id a create produced, for the list to open. */
    val createdChatId: Map<String, String> = emptyMap(),
    /** Per chat, NEWEST FIRST as the wire delivers them. */
    val messages: Map<String, List<NoteMessage>> = emptyMap(),
    val messagesLoading: Set<String> = emptySet(),
    val paging: Set<String> = emptySet(),
    val hasMore: Map<String, Boolean> = emptyMap(),
    val messagesError: Map<String, String> = emptyMap(),
    val sending: Set<String> = emptySet(),
    val sendError: Map<String, String> = emptyMap(),
    /**
     * The last part of a note the Mac accepted, per chat key, for the composer to let go
     * of: only then is what it carried really on the Mac.
     */
    val accepted: Map<String, NoteSentPart> = emptyMap(),
    val noteMutating: Set<String> = emptySet(),
    val noteError: Map<String, String> = emptyMap(),
    /** Bumped on each failure the phone should feel (iOS `Haptics.error()`). */
    val errorTick: Int = 0
) {
    fun chatList(project: String): List<NoteChat> = chats[project].orEmpty()

    /** The chat's notes oldest-first, the order a transcript reads in. */
    fun orderedMessages(project: String, chatId: String): List<NoteMessage> =
        messages[notesKey(project, chatId)].orEmpty().asReversed()

    fun canLoadMore(project: String, chatId: String): Boolean =
        hasMore[notesKey(project, chatId)] ?: false
}
