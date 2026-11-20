package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.ui.graphics.ImageBitmap
import java.util.UUID

/**
 * One queued attachment in the composer: an image (photos, camera, clipboard), a
 * video (photos) or any file. It uploads to the Mac as soon as it's added; the
 * returned Mac path is held here and appended to the outgoing message on send,
 * never shown in the text field.
 */
data class Attachment(
    val kind: Kind,
    val filename: String,
    val mime: String,
    /** A small preview for image and video chips (null for files). */
    val thumbnail: ImageBitmap? = null,
    val status: Status = Status.Uploading,
    /** How much of a file sent in pieces has reached the Mac, 0..1. */
    val progress: Double? = null,
    /**
     * Per-upload id the server echoes, matching this chip's reply regardless of
     * order. Changes on retry so a late reply for a superseded attempt is ignored.
     */
    val reqId: String = "",
    val id: String = UUID.randomUUID().toString()
) {
    enum class Kind { Image, Video, File }

    sealed interface Status {
        data object Uploading : Status

        /** `path` is where the file landed on the Mac. */
        data class Uploaded(val path: String) : Status

        data class Failed(val message: String) : Status
    }

    val macPath: String? get() = (status as? Status.Uploaded)?.path
    val isPending: Boolean get() = status == Status.Uploading
    val isFailed: Boolean get() = status is Status.Failed
}

/**
 * One prepared prompt: its own text and attachments. A terminal can hold several
 * (the tab strip), each edited independently.
 */
data class ComposerTab(
    val text: String = "",
    val attachments: List<Attachment> = emptyList(),
    val id: String = UUID.randomUUID().toString()
) {
    val preview: String
        get() {
            val trimmed = text.trim()
            if (trimmed.isNotEmpty()) return trimmed.takeCodePoints(PREVIEW_LENGTH)
            if (attachments.isNotEmpty()) {
                return "${attachments.size} attachment${if (attachments.size == 1) "" else "s"}"
            }
            return "Empty"
        }

    private companion object {
        const val PREVIEW_LENGTH = 24
    }
}

/** One arriving rewrite variant for the picker; `text` on success, `error` on failure. */
data class TransformVariant(
    val idx: Int,
    val text: String?,
    val error: String?,
    val id: String = UUID.randomUUID().toString()
)

/**
 * Whether the active tab can be sent, and the message body to send (text plus the
 * uploaded attachments' Mac paths, in chip order).
 */
sealed interface SendState {
    data class Ready(val body: String) : SendState

    /** An upload is still in flight. */
    data object Pending : SendState

    /** Sendable, but some failed uploads were left out. */
    data class DroppedFailures(val body: String) : SendState

    data object Empty : SendState
}

/** A terminal's composer: its prompt tabs plus the in-flight AI rewrite. */
data class ComposerState(
    val tabs: List<ComposerTab> = listOf(ComposerTab()),
    val activeIndex: Int = 0,
    val transforming: Boolean = false,
    val showVariants: Boolean = false,
    val variants: List<TransformVariant> = emptyList(),
    val transformError: String? = null,
    /** Why an attachment couldn't be sent, when retrying won't help. */
    val uploadError: String? = null,
    /** The last prompt this phone sent here, offered back in the empty field. */
    val lastSent: String? = null,
    /** What the next prompt asks the agent for instead of a text answer. */
    val answer: AnswerKind? = null
) {
    val activeTab: ComposerTab get() = tabs.getOrNull(activeIndex) ?: ComposerTab()
    val text: String get() = tabs.getOrNull(activeIndex)?.text.orEmpty()
    val attachments: List<Attachment> get() = tabs.getOrNull(activeIndex)?.attachments.orEmpty()

    /**
     * Blocked while any attachment is still uploading; failed attachments are
     * dropped from the body.
     */
    val sendState: SendState
        get() {
            val tab = activeTab
            if (tab.attachments.any { it.isPending }) return SendState.Pending
            val paths = tab.attachments.mapNotNull { it.macPath }
            val hadFailures = tab.attachments.any { it.isFailed }
            var body = tab.text
            if (paths.isNotEmpty()) {
                val joined = paths.joinToString(" ")
                body = if (body.isBlank()) {
                    joined
                } else {
                    body + (if (body.endsWith(" ") || body.endsWith("\n")) "" else " ") + joined
                }
            }
            if (body.isBlank()) return SendState.Empty
            return if (hadFailures) SendState.DroppedFailures(body) else SendState.Ready(body)
        }
}

/** At most `count` code points, so a preview never splits a surrogate pair. */
internal fun String.takeCodePoints(count: Int): String {
    if (codePointCount(0, length) <= count) return this
    return substring(0, offsetByCodePoints(0, count))
}
