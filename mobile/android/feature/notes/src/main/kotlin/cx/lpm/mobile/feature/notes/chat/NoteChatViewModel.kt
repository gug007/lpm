package cx.lpm.mobile.feature.notes.chat

import androidx.compose.ui.graphics.ImageBitmap
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.dictation.DictationStore
import cx.lpm.mobile.core.data.dictation.plusDictated
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.NoteAttachment
import cx.lpm.mobile.core.navigation.NoteChatKey
import cx.lpm.mobile.feature.notes.composer.NoteFileRead
import cx.lpm.mobile.feature.notes.composer.NoteMedia
import cx.lpm.mobile.feature.notes.composer.PendingNoteAttachment
import cx.lpm.mobile.feature.notes.data.NoteAttachmentDraft
import cx.lpm.mobile.feature.notes.data.NoteAttachments
import cx.lpm.mobile.feature.notes.data.NotesStore
import cx.lpm.mobile.feature.notes.data.notesKey
import cx.lpm.mobile.feature.notes.format.NotesClock
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * One notebook chat (iOS `NotesChatView` and its `NotesComposer`): the transcript,
 * paged backwards, and the note being written with the files queued for it. Images
 * are downscaled and files read off the main thread; anything over the link's
 * per-file ceiling is refused before it's sent.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = NoteChatViewModel.Factory::class)
class NoteChatViewModel @AssistedInject constructor(
    @Assisted val key: NoteChatKey,
    private val sessions: MacSessions,
    private val media: NoteMedia,
    private val clock: Clock,
    private val dictation: DictationStore
) : ViewModel() {
    private val store: NotesStore? get() = sessions[key.session]?.store()
    private val chatKey = notesKey(key.project, key.chatId)
    private val draft = MutableStateFlow(NoteDraft())
    private var nextId = 0L

    val dictationOwner = "note:$chatKey"
    val dictationState get() = dictation.state
    val dictationMeter get() = dictation.meter
    val needsMicrophone: Boolean get() = dictation.needsMicrophone

    private val initial = NoteChatUiState(title = key.title)

    val uiState: StateFlow<NoteChatUiState> = sessions.session(key.session)
        .flatMapLatest { s -> s?.let(::chatState) ?: flowOf(initial) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initial)

    init {
        // Hold the text until the Mac accepts it, so a failed send doesn't swallow
        // what the user wrote.
        viewModelScope.launch {
            var wasSending = false
            sessions.session(key.session).filterNotNull()
                .flatMapLatest { it.store<NotesStore>().state }
                .collect { s ->
                    val sending = chatKey in s.sending
                    if (wasSending && !sending && chatKey !in s.sendError) draft.value = NoteDraft()
                    wasSending = sending
                }
        }
    }

    private fun chatState(s: MacSession) = s.store<NotesStore>().let { notes ->
        combine(notes.state, notes.attachments.state, draft) { state, files, draft ->
            noteChatUiState(
                key.project,
                key.chatId,
                key.title,
                state,
                files,
                draft,
                NotesClock(clock.instant(), clock.zone)
            )
        }
    }

    /** Counts as the project's notes screen too, so a reconnect replays this chat. */
    fun open() {
        val s = store ?: return
        s.screenDidOpen(key.project)
        s.chatDidOpen(key.project, key.chatId)
    }

    fun close() {
        val s = store ?: return
        s.chatDidClose(key.project, key.chatId)
        s.screenDidClose(key.project)
    }

    fun loadMore() {
        store?.loadMoreMessages(key.project, key.chatId)
    }

    suspend fun refresh() {
        store?.loadMessages(key.project, key.chatId)
        delay(REFRESH_SETTLE_MS)
    }

    fun edit(id: String, text: String) {
        store?.editNote(key.project, id, text)
    }

    fun delete(id: String) {
        store?.deleteNote(key.project, id)
    }

    fun clearErrors() {
        store?.clearErrors(key.project, key.chatId)
    }

    // attachments under the notes

    fun attachmentBytes(hash: String): ByteArray? = store?.attachments?.data(hash)

    fun fetch(attachment: NoteAttachment) {
        store?.attachments?.fetch(key.project, attachment.hash, attachment.size)
    }

    // the composer

    fun setText(text: String) = draft.update { it.copy(text = text) }

    fun startDictation() = dictation.start(dictationOwner) { words ->
        draft.update { it.copy(text = it.text.plusDictated(words)) }
    }

    fun stopDictation() = dictation.stop()

    fun cancelDictation() = dictation.cancel()

    fun refuseDictation() = dictation.refuse(dictationOwner)

    /** The draft goes with the screen, so a take that's still running goes too. */
    fun abandonDictation() = dictation.abandon(dictationOwner)

    fun send() {
        if (dictation.state.value.isActive(dictationOwner)) return
        val current = draft.value
        if (!current.hasContent) return
        val drafts = current.pending.mapNotNull { item ->
            item.data?.let { NoteAttachmentDraft(item.name, item.mimeType, it) }
        }
        store?.addNote(key.project, key.chatId, current.text, drafts)
        dictation.noteSent()
    }

    /** Photos keep their pick order however their loads finish: the chips are reserved first. */
    fun addPhotos(uris: List<String>) {
        val reserved = uris.map { reserve(PHOTO_NAME, PHOTO_MIME) to it }
        reserved.forEach { (id, uri) -> viewModelScope.launch { encode(id, uri) } }
    }

    /** A camera shot: encoded like a picked photo, its capture file dropped once read. */
    fun addCapture(uri: String) {
        val id = reserve(PHOTO_NAME, PHOTO_MIME)
        viewModelScope.launch {
            encode(id, uri)
            media.discardCapture(uri)
        }
    }

    fun addFiles(uris: List<String>) {
        viewModelScope.launch {
            val reserved = uris.map { reserve(media.displayName(it), media.mimeType(it)) to it }
            reserved.forEach { (id, uri) ->
                launch {
                    when (val read = media.readFile(uri, NoteAttachments.BYTE_LIMIT)) {
                        is NoteFileRead.Bytes -> fill(id, read.data, null)
                        NoteFileRead.TooLarge -> refuse(id)
                        NoteFileRead.Unreadable -> drop(id)
                    }
                }
            }
        }
    }

    fun drop(id: Long) = draft.update { d -> d.copy(pending = d.pending.filterNot { it.id == id }) }

    fun dismissWarning() = draft.update { it.copy(warning = null) }

    private suspend fun encode(id: Long, uri: String) {
        val encoded = media.encodeImage(uri)
        when {
            encoded == null -> drop(id)
            encoded.data.size > NoteAttachments.BYTE_LIMIT -> refuse(id)
            else -> fill(id, encoded.data, encoded.thumbnail)
        }
    }

    private fun reserve(name: String, mimeType: String): Long {
        val id = nextId++
        draft.update { it.copy(pending = it.pending + PendingNoteAttachment(id, name, mimeType)) }
        return id
    }

    private fun fill(id: Long, data: ByteArray, thumbnail: ImageBitmap?) = draft.update { d ->
        d.copy(pending = d.pending.map { if (it.id == id) it.filled(data, thumbnail) else it })
    }

    private fun refuse(id: Long) {
        drop(id)
        draft.update { it.copy(warning = NotesStore.TOO_LARGE) }
    }

    @AssistedFactory
    interface Factory {
        fun create(key: NoteChatKey): NoteChatViewModel
    }

    private companion object {
        const val REFRESH_SETTLE_MS = 500L
        const val PHOTO_NAME = "photo.jpg"
        const val PHOTO_MIME = "image/jpeg"
    }
}
