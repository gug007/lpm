package cx.lpm.mobile.feature.notes.data

import cx.lpm.mobile.core.model.NoteChat
import cx.lpm.mobile.core.model.NoteMessage

internal fun NotesState.withChats(
    project: String,
    list: List<NoteChat>,
    error: String?
): NotesState {
    val loaded = copy(chatsLoading = chatsLoading - project, chatsLoaded = chatsLoaded + project)
    return if (error != null) {
        loaded.copy(chatsError = chatsError + (project to error))
    } else {
        loaded.copy(chats = chats + (project to list), chatsError = chatsError - project)
    }
}

/**
 * The chat list didn't answer: a failure only when there's nothing to show.
 * `unanswered` names a Mac that is there but hasn't answered.
 */
internal fun NotesState.chatsTimedOut(project: String, unanswered: String?): NotesState {
    val error = unanswered?.let { "$it Pull to refresh." } ?: UNREACHABLE
    return copy(
        chatsLoading = chatsLoading - project,
        chatsError = if (project in chats) chatsError else chatsError + (project to error)
    )
}

internal fun NotesState.chatMutationStarted(key: String, project: String): NotesState =
    copy(chatMutating = chatMutating + key, chatError = chatError - project)

/** A rename or delete answered, or [error] when it failed or timed out. */
internal fun NotesState.chatMutationFinished(key: String, project: String, error: String?) = copy(
    chatMutating = chatMutating - key,
    chatError = if (error != null) chatError + (project to error) else chatError
)

internal fun NotesState.withCreatedChat(
    project: String,
    chat: NoteChat?,
    error: String?
): NotesState {
    val done = copy(chatMutating = chatMutating - project)
    if (chat == null) {
        return done.copy(
            chatError = chatError + (project to (error ?: "Couldn't create the chat."))
        )
    }
    return done.copy(
        chats = chats + (project to listOf(chat) + chatList(project)),
        createdChatId = createdChatId + (project to chat.id)
    )
}

internal fun NotesState.withoutChat(project: String, chatId: String): NotesState {
    val key = notesKey(project, chatId)
    return copy(
        chats = chats + (project to chatList(project).filterNot { it.id == chatId }),
        messages = messages - key,
        hasMore = hasMore - key
    )
}

internal fun NotesState.messagesLoadStarted(key: String): NotesState =
    copy(messagesLoading = messagesLoading + key, messagesError = messagesError - key)

/** A page answering the request in flight: the newest replaces what's held, an older one appends. */
internal fun NotesState.withPage(
    key: String,
    beforeId: String,
    page: List<NoteMessage>,
    error: String?
): NotesState {
    val settled = copy(messagesLoading = messagesLoading - key, paging = paging - key)
    if (error != null) return settled.copy(messagesError = messagesError + (key to error))
    val held = if (beforeId.isEmpty()) page else messages[key].orEmpty() + page
    return settled.copy(
        messagesError = messagesError - key,
        messages = messages + (key to held),
        hasMore = hasMore + (key to (page.size >= NotesStore.PAGE_SIZE))
    )
}

/** A page didn't answer: a failure only when the chat has nothing to show. */
internal fun NotesState.pageTimedOut(key: String, unanswered: String?): NotesState {
    val error = unanswered ?: PAGE_FAILED
    return copy(
        messagesLoading = messagesLoading - key,
        paging = paging - key,
        messagesError = if (key in messages) messagesError else messagesError + (key to error)
    )
}

internal fun NotesState.sendStarted(key: String): NotesState =
    copy(sending = sending + key, sendError = sendError - key)

/** A note the phone won't send; the phone feels it. */
internal fun NotesState.sendRefused(key: String, error: String): NotesState =
    copy(sendError = sendError + (key to error), errorTick = errorTick + 1)

internal fun NotesState.sendTimedOut(key: String): NotesState =
    copy(sending = sending - key, sendError = sendError + (key to SEND_TIMED_OUT))

/** A part of the note the Mac took, which the composer now lets go of. */
internal fun NotesState.withAcceptedPart(key: String, part: NotePart): NotesState {
    val tick = (accepted[key]?.tick ?: 0) + 1
    val sent = NoteSentPart(tick, text = part.text.isNotEmpty(), attachments = part.drafts.size)
    return copy(accepted = accepted + (key to sent))
}

/**
 * The link dropped with notes on their way: they may or may not have reached the Mac,
 * so the composer keeps them and says so rather than looking sent.
 */
internal fun NotesState.sendsInterrupted(): NotesState = copy(
    sending = emptySet(),
    sendError = sendError + sending.associateWith { SEND_INTERRUPTED }
)

internal fun NotesState.withAddedNote(
    project: String,
    chatId: String,
    message: NoteMessage?,
    error: String?
): NotesState {
    val key = notesKey(project, chatId)
    val done = copy(sending = sending - key)
    if (message == null) return done.sendRefused(key, error ?: "Couldn't add the note.")
    // The chats list is ordered by last activity, so this chat is now first.
    val list = chatList(project)
    val moved = list.firstOrNull { it.id == chatId }?.let { chat ->
        listOf(chat) + list.filterNot { it.id == chatId }
    }
    return done.copy(
        sendError = sendError - key,
        messages = messages[key]?.let { messages + (key to listOf(message) + it) } ?: messages,
        chats = if (moved != null) chats + (project to moved) else chats
    )
}

/**
 * A note's text replaced in place once the Mac accepted the edit, so the transcript
 * updates without refetching (which would drop loaded pages).
 */
internal fun NotesState.noteMutationStarted(key: String): NotesState =
    copy(noteMutating = noteMutating + key, noteError = noteError - key)

/** An edit or delete answered, or [error] when it failed or timed out. */
internal fun NotesState.noteMutationFinished(key: String, error: String?): NotesState = copy(
    noteMutating = noteMutating - key,
    noteError = if (error != null) noteError + (key to error) else noteError
)

internal fun NotesState.withEditedText(
    project: String,
    id: String,
    text: String,
    stamp: Long
): NotesState = copy(
    messages = messages.inProject(project) { list ->
        list.map { if (it.id == id) it.copy(text = text, editedAt = stamp) else it }
    }
)

internal fun NotesState.withoutNote(project: String, id: String): NotesState = copy(
    messages = messages.inProject(project) { list -> list.filterNot { it.id == id } }
)

/** The chat's send and load failures and its notes' edit/delete failures, cleared. */
internal fun NotesState.withoutErrors(project: String, chatId: String): NotesState {
    val key = notesKey(project, chatId)
    val ids = messages[key].orEmpty().map { notesKey(project, it.id) }.toSet()
    return copy(
        sendError = sendError - key,
        messagesError = messagesError - key,
        noteError = noteError - ids
    )
}

/** Every chat of [project] with its notes changed by [change]. */
private fun Map<String, List<NoteMessage>>.inProject(
    project: String,
    change: (List<NoteMessage>) -> List<NoteMessage>
): Map<String, List<NoteMessage>> =
    mapValues { (key, list) -> if (key.startsWith(project + "\n")) change(list) else list }

private const val UNREACHABLE = "Couldn't reach your Mac. Pull to refresh."
private const val PAGE_FAILED = "Couldn't load these notes. Try again."
private const val SEND_TIMED_OUT = "Sending timed out. Check your Mac and try again."
private const val SEND_INTERRUPTED =
    "The connection dropped before your Mac confirmed this note. Check the chat before sending it again."
