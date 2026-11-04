package cx.lpm.mobile.feature.notes.chat

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.model.NoteMessage
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.feature.notes.composer.PendingNoteAttachment
import cx.lpm.mobile.feature.notes.data.NoteAttachmentsState
import cx.lpm.mobile.feature.notes.data.NotesState
import cx.lpm.mobile.feature.notes.data.notesKey
import cx.lpm.mobile.feature.notes.format.NotesClock

/** One line of the transcript: a day's capsule, or a note. */
@Immutable
sealed interface NoteChatItem {
    val key: String

    data class Day(val epochDay: Long, val label: String) : NoteChatItem {
        override val key: String get() = "day-$epochDay"
    }

    data class Note(val message: NoteMessage, val time: String, val busy: Boolean) : NoteChatItem {
        override val key: String get() = "note-" + message.id
    }
}

/** What covers an empty transcript. */
enum class NoteChatOverlay { None, Loading, Empty }

/** What the composer holds: the text and the files queued with it. */
@Immutable
data class NoteDraft(
    val text: String = "",
    val pending: List<PendingNoteAttachment> = emptyList(),
    /** A file refused for its size, shown in a toast. */
    val warning: String? = null
) {
    val hasContent: Boolean get() = text.trimmingWhitespace().isNotEmpty() || pending.isNotEmpty()
    val encoding: Boolean get() = pending.any { !it.ready }
}

@Immutable
data class NoteChatUiState(
    val title: String,
    /** NEWEST FIRST, for a transcript laid out from the bottom up. */
    val items: List<NoteChatItem> = emptyList(),
    val newestId: String? = null,
    val canLoadMore: Boolean = false,
    val overlay: NoteChatOverlay = NoteChatOverlay.Loading,
    val error: String? = null,
    val sending: Boolean = false,
    val attachments: NoteAttachmentsState = NoteAttachmentsState(),
    val draft: NoteDraft = NoteDraft(),
    val errorTick: Int = 0
) {
    val canSend: Boolean get() = draft.hasContent && !sending && !draft.encoding
}

internal fun noteChatUiState(
    project: String,
    chatId: String,
    title: String,
    notes: NotesState,
    attachments: NoteAttachmentsState,
    draft: NoteDraft,
    clock: NotesClock
): NoteChatUiState {
    val key = notesKey(project, chatId)
    val ordered = notes.orderedMessages(project, chatId)
    val overlay = when {
        ordered.isNotEmpty() -> NoteChatOverlay.None
        key in notes.messagesLoading -> NoteChatOverlay.Loading
        key !in notes.messagesError -> NoteChatOverlay.Empty
        else -> NoteChatOverlay.None
    }
    val error = notes.sendError[key]
        ?: notes.messagesError[key]
        ?: ordered.firstNotNullOfOrNull { notes.noteError[notesKey(project, it.id)] }
    return NoteChatUiState(
        title = title,
        items = transcript(project, ordered, notes, clock).asReversed(),
        newestId = ordered.lastOrNull()?.id,
        canLoadMore = notes.canLoadMore(project, chatId),
        overlay = overlay,
        error = error,
        sending = key in notes.sending,
        attachments = attachments,
        draft = draft,
        errorTick = notes.errorTick
    )
}

/** Oldest first, a day's capsule before its first note. */
private fun transcript(
    project: String,
    ordered: List<NoteMessage>,
    notes: NotesState,
    clock: NotesClock
): List<NoteChatItem> = buildList {
    var day: Long? = null
    for (message in ordered) {
        val date = clock.day(message.ts)
        if (date.toEpochDay() != day) {
            day = date.toEpochDay()
            add(NoteChatItem.Day(date.toEpochDay(), clock.dayLabel(date)))
        }
        add(
            NoteChatItem.Note(
                message = message,
                time = clock.clockTime(message.ts),
                busy = notesKey(project, message.id) in notes.noteMutating
            )
        )
    }
}
