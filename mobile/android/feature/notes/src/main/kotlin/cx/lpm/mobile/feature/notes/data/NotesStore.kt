package cx.lpm.mobile.feature.notes.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.notesAddMessage
import cx.lpm.mobile.core.data.client.notesCreateChat
import cx.lpm.mobile.core.data.client.notesDeleteChat
import cx.lpm.mobile.core.data.client.notesDeleteMessage
import cx.lpm.mobile.core.data.client.notesEditMessage
import cx.lpm.mobile.core.data.client.notesRenameChat
import cx.lpm.mobile.core.data.client.requestNotesChats
import cx.lpm.mobile.core.data.client.requestNotesMessages
import cx.lpm.mobile.core.data.link.macLabel
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.NoteChat
import cx.lpm.mobile.core.model.NoteMessage
import cx.lpm.mobile.core.model.trimmingWhitespace
import java.time.Clock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

/**
 * Notes for every project and the operations that drive them (iOS `NotesStore`), with
 * its [search] and attachment bytes ([attachments]). Note text and bytes stay in memory
 * for the session and never touch the phone's disk: the notebook is encrypted on the
 * Mac and this link is the only place its plaintext exists off it.
 *
 * Every verb answers off a worker on the Mac and there is no change push, so replies
 * can land out of order and the screens refetch rather than listen.
 */
class NotesStore(private val session: MacSession, private val clock: Clock = Clock.systemUTC()) :
    SessionStore {
    private val mutable = MutableStateFlow(NotesState())
    val state: StateFlow<NotesState> = mutable.asStateFlow()

    val search = NotesSearch(session)
    val attachments = NoteAttachments(session)

    private val client: LpmClient? get() = session.client
    private val timeout = GenerationTimeout<String>(session.scope)

    // The project whose notes screen shows and the chat it has open, so a reconnect
    // replays exactly what the user is looking at. The list and a chat pushed over it
    // are both on screen while the push animates, so screens are counted per project.
    private var activeProject: String? = null
    private val openScreens = mutableMapOf<String, Int>()
    private val activeChat = mutableMapOf<String, String>()

    // The `beforeId` of the page in flight per chat; a reply echoing another is superseded.
    private val pendingPage = mutableMapOf<String, String>()

    // The text each in-flight edit carries; the reply echoes only the note id.
    private val pendingEdit = mutableMapOf<String, String>()

    // The parts of a note still to go per chat key, the first on its way.
    private val parts = mutableMapOf<String, List<NotePart>>()

    override fun wire(client: LpmClient) {
        client.onNotesChats = ::applyChats
        client.onNotesCreateChat = ::finishCreateChat
        client.onNotesRenameChat = ::finishRenameChat
        client.onNotesDeleteChat = ::finishDeleteChat
        client.onNotesMessages = ::applyMessages
        client.onNotesAddMessage = ::finishAddNote
        client.onNotesEditMessage = ::finishEditNote
        client.onNotesDeleteMessage = ::finishDeleteNote
        client.onNotesSearch = search::apply
        client.onNotesAttachment = { _, hash, data, error -> attachments.apply(hash, data, error) }
    }

    override fun reset() {
        timeout.cancelAll()
        activeProject = null
        openScreens.clear()
        activeChat.clear()
        pendingPage.clear()
        pendingEdit.clear()
        parts.clear()
        mutable.value = NotesState()
        search.reset()
        attachments.reset()
    }

    /**
     * The socket was replaced: nothing in flight can still answer, so drop the spinners
     * and re-issue whatever the user is actually looking at.
     */
    override fun onConnectionReset() {
        timeout.cancelAll()
        pendingPage.clear()
        parts.clear()
        mutable.update {
            it.sendsInterrupted().copy(
                chatsLoading = emptySet(),
                chatMutating = emptySet(),
                messagesLoading = emptySet(),
                paging = emptySet(),
                noteMutating = emptySet()
            )
        }
        search.handleConnectionReset(activeProject)
        attachments.handleConnectionReset()
        val project = activeProject ?: return
        loadChats(project)
        activeChat[project]?.let { loadMessages(project, it) }
    }

    // screen lifecycle

    fun screenDidOpen(project: String) {
        openScreens[project] = (openScreens[project] ?: 0) + 1
        activeProject = project
        loadChats(project)
    }

    fun screenDidClose(project: String) {
        val left = (openScreens[project] ?: 0) - 1
        if (left > 0) {
            openScreens[project] = left
        } else {
            openScreens.remove(project)
            if (activeProject == project) activeProject = null
        }
        search.clear(project)
    }

    fun chatDidOpen(project: String, chatId: String) {
        activeChat[project] = chatId
        if (notesKey(project, chatId) !in state.value.messages) loadMessages(project, chatId)
    }

    fun chatDidClose(project: String, chatId: String) {
        if (activeChat[project] == chatId) activeChat.remove(project)
        pendingPage.remove(notesKey(project, chatId))
    }

    // chats

    fun loadChats(project: String) {
        if (project in state.value.chatsLoading) return
        mutable.update {
            it.copy(chatsLoading = it.chatsLoading + project, chatsError = it.chatsError - project)
        }
        client?.requestNotesChats(project)
        arm("chats", project, LOAD_TIMEOUT_MS) {
            if (project in state.value.chatsLoading) {
                mutable.update { it.chatsTimedOut(project, unanswered) }
            }
        }
    }

    fun createChat(project: String, title: String) {
        val trimmed = title.trimmingWhitespace()
        if (trimmed.isEmpty()) return
        mutateChat("createChat", project, project, "Creating the chat timed out. Try again.") {
            it.notesCreateChat(project, trimmed)
        }
    }

    fun renameChat(project: String, chatId: String, title: String) {
        val trimmed = title.trimmingWhitespace()
        if (trimmed.isEmpty()) return
        val key = notesKey(project, chatId)
        mutateChat("renameChat", key, project, "Renaming the chat timed out. Try again.") {
            it.notesRenameChat(project, chatId, trimmed)
        }
    }

    fun deleteChat(project: String, chatId: String) {
        val key = notesKey(project, chatId)
        mutateChat("deleteChat", key, project, "Deleting the chat timed out. Try again.") {
            it.notesDeleteChat(project, chatId)
        }
    }

    fun dismissChatError(project: String) =
        mutable.update { it.copy(chatError = it.chatError - project) }

    fun consumeCreated(project: String) =
        mutable.update { it.copy(createdChatId = it.createdChatId - project) }

    // messages

    /** The newest page for a chat, replacing anything held. */
    fun loadMessages(project: String, chatId: String) {
        val key = notesKey(project, chatId)
        if (key in state.value.messagesLoading) return
        mutable.update { it.messagesLoadStarted(key) }
        requestPage(project, chatId, beforeId = "")
    }

    /** One page older than everything held; a short page means the history is exhausted. */
    fun loadMoreMessages(project: String, chatId: String) {
        val key = notesKey(project, chatId)
        val s = state.value
        if (s.hasMore[key] != true || key in s.messagesLoading || key in s.paging) return
        val oldest = s.messages[key]?.lastOrNull() ?: return
        mutable.update { it.copy(paging = it.paging + key) }
        requestPage(project, chatId, beforeId = oldest.id)
    }

    /**
     * Post a note. Attachments ride inline, so anything over the link's per-file
     * ceiling is refused here rather than sent and rejected.
     */
    fun addNote(
        project: String,
        chatId: String,
        text: String,
        drafts: List<NoteAttachmentDraft> = emptyList()
    ) {
        val key = notesKey(project, chatId)
        if (key in state.value.sending) return
        if (text.trimmingWhitespace().isEmpty() && drafts.isEmpty()) return
        if (drafts.any { it.data.size > NoteAttachments.BYTE_LIMIT }) {
            mutable.update { it.sendRefused(key, TOO_LARGE) }
            return
        }
        mutable.update { it.sendStarted(key) }
        // Several attachments that together would make one frame too big for the Mac go
        // as further notes, one after another.
        val split = NotePart.split(text, drafts)
        parts[key] = split
        sendPart(split.first(), project, chatId)
    }

    private fun sendPart(part: NotePart, project: String, chatId: String) {
        val key = notesKey(project, chatId)
        client?.notesAddMessage(
            project,
            chatId,
            part.text,
            part.drafts.map(NoteAttachmentDraft::wire)
        )
        arm("add", key, SEND_TIMEOUT_MS) {
            if (key !in state.value.sending) return@arm
            parts.remove(key)
            mutable.update { it.sendTimedOut(key) }
        }
    }

    fun editNote(project: String, id: String, text: String) {
        val key = notesKey(project, id)
        if (!beginNoteMutation("edit", key, "Saving the change timed out. Try again.")) return
        pendingEdit[key] = text
        client?.notesEditMessage(project, id, text)
    }

    fun deleteNote(project: String, id: String) {
        val key = notesKey(project, id)
        if (!beginNoteMutation("deleteNote", key, "Deleting the note timed out. Try again.")) return
        client?.notesDeleteMessage(project, id)
    }

    /** Clear the chat's send and load failures and its notes' edit/delete failures. */
    fun clearErrors(project: String, chatId: String) {
        mutable.update { it.withoutErrors(project, chatId) }
    }

    // reply handlers

    private fun applyChats(project: String, list: List<NoteChat>, error: String?) {
        cancel("chats", project)
        mutable.update { it.withChats(project, list, error) }
    }

    private fun finishCreateChat(project: String, chat: NoteChat?, error: String?) {
        cancel("createChat", project)
        mutable.update { it.withCreatedChat(project, chat, error) }
    }

    private fun finishRenameChat(project: String, chatId: String, error: String?) {
        val key = notesKey(project, chatId)
        cancel("renameChat", key)
        mutable.update { it.chatMutationFinished(key, project, error) }
        if (error == null) loadChats(project)
    }

    private fun finishDeleteChat(project: String, chatId: String, error: String?) {
        val key = notesKey(project, chatId)
        cancel("deleteChat", key)
        mutable.update { it.chatMutationFinished(key, project, error) }
        if (error != null) return
        mutable.update { it.withoutChat(project, chatId) }
        chatDidClose(project, chatId)
    }

    private fun applyMessages(
        project: String,
        chatId: String,
        beforeId: String,
        page: List<NoteMessage>,
        error: String?
    ) {
        val key = notesKey(project, chatId)
        // A page whose chat closed, or that answers a superseded request, isn't on screen.
        if (pendingPage[key] != beforeId) return
        pendingPage.remove(key)
        cancel("page", key)
        mutable.update { it.withPage(key, beforeId, page, error) }
    }

    private fun finishAddNote(
        project: String,
        chatId: String,
        message: NoteMessage?,
        error: String?
    ) {
        val key = notesKey(project, chatId)
        cancel("add", key)
        val left = parts.remove(key).orEmpty()
        val part = left.firstOrNull()?.takeIf { message != null }
        val rest = left.drop(1)
        val next = rest.firstOrNull()?.takeIf { message != null }
        mutable.update { s ->
            val added = s.withAddedNote(project, chatId, message, error)
            val took = if (part != null) added.withAcceptedPart(key, part) else added
            if (next != null) took.copy(sending = took.sending + key) else took
        }
        if (next != null) {
            parts[key] = rest
            sendPart(next, project, chatId)
        }
    }

    private fun finishEditNote(project: String, id: String, error: String?) {
        val key = notesKey(project, id)
        cancel("edit", key)
        val text = pendingEdit.remove(key)
        mutable.update { it.noteMutationFinished(key, error) }
        if (error == null &&
            text != null
        ) {
            mutable.update { it.withEditedText(project, id, text, clock.millis()) }
        }
    }

    private fun finishDeleteNote(project: String, id: String, error: String?) {
        val key = notesKey(project, id)
        cancel("deleteNote", key)
        mutable.update { it.noteMutationFinished(key, error) }
        if (error != null) return
        mutable.update { it.withoutNote(project, id) }
        search.removeHit(project, id)
    }

    private fun requestPage(project: String, chatId: String, beforeId: String) {
        val key = notesKey(project, chatId)
        pendingPage[key] = beforeId
        client?.requestNotesMessages(project, chatId, PAGE_SIZE, beforeId)
        arm("page", key, LOAD_TIMEOUT_MS) {
            pendingPage.remove(key)
            mutable.update { it.pageTimedOut(key, unanswered) }
        }
    }

    private fun mutateChat(
        op: String,
        key: String,
        project: String,
        timedOut: String,
        send: (LpmClient) -> Unit
    ) {
        if (key in state.value.chatMutating) return
        mutable.update { it.chatMutationStarted(key, project) }
        client?.let(send)
        arm(op, key, MUTATION_TIMEOUT_MS) {
            if (key in state.value.chatMutating) {
                mutable.update { it.chatMutationFinished(key, project, timedOut) }
            }
        }
    }

    private fun beginNoteMutation(op: String, key: String, timedOut: String): Boolean {
        if (key in state.value.noteMutating) return false
        mutable.update { it.noteMutationStarted(key) }
        arm(op, key, MUTATION_TIMEOUT_MS) {
            if (key in
                state.value.noteMutating
            ) {
                mutable.update { it.noteMutationFinished(key, timedOut) }
            }
        }
        return true
    }

    /**
     * A read that timed out while the link is up: the Mac is there but its notebook
     * hasn't answered, as when it waits on a Keychain prompt.
     */
    private val unanswered: String?
        get() {
            if (!session.link.isReady) return null
            return "No answer from ${session.link.macLabel()} yet. It may be waiting on a " +
                "prompt on its screen, such as Keychain access."
        }

    private fun arm(op: String, key: String, millis: Long, fire: () -> Unit) =
        timeout.arm(op + "\u0000" + key, millis, fire)

    private fun cancel(op: String, key: String) = timeout.cancel(op + "\u0000" + key)

    companion object {
        const val PAGE_SIZE = 50
        private const val LOAD_TIMEOUT_MS = 25_000L
        private const val MUTATION_TIMEOUT_MS = 30_000L
        private const val SEND_TIMEOUT_MS = 60_000L
        internal const val TOO_LARGE =
            "That file is too large to send from your phone. Add it from your Mac instead."
    }
}
