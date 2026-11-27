package cx.lpm.mobile.feature.notes.data

import cx.lpm.mobile.core.protocol.noteGroups

/** One note's share of what the composer sends (iOS `NotePart`): the first carries the text. */
class NotePart(val text: String, val drafts: List<NoteAttachmentDraft>) {
    companion object {
        fun split(text: String, drafts: List<NoteAttachmentDraft>): List<NotePart> =
            noteGroups(drafts) { it.data.size }
                .mapIndexed { i, group -> NotePart(if (i == 0) text else "", group) }
    }
}

/**
 * A part of a note the Mac accepted (iOS `NoteSentPart`): whether it carried the text,
 * and how many of the composer's attachments, from the first.
 */
data class NoteSentPart(val tick: Int, val text: Boolean, val attachments: Int)
