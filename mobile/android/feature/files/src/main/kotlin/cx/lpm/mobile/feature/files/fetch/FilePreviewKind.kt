package cx.lpm.mobile.feature.files.fetch

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/** How the preview sheet shows a file, decided from its name and first bytes. */
enum class FilePreviewKind {
    Text,
    Markdown,
    Media,

    /** Images, PDFs, office documents and anything else — the platform viewers' job. */
    Document;

    val isText: Boolean get() = this == Text || this == Markdown

    companion object {
        private const val SAMPLE_BYTES = 8192
        private val MARKDOWN = setOf("md", "markdown", "mdx")

        /**
         * Content wins over the extension where they disagree: `.ts` is TypeScript far
         * more often than an MPEG transport stream, and a real video never reads as
         * UTF-8 text. Images stay images even when they are text (SVG). [mimeType] is
         * the type the platform knows for the name's extension.
         */
        fun classify(name: String, head: ByteArray, mimeType: String?): FilePreviewKind {
            val ext = pathExtension(name).lowercase()
            if (mimeType != null && (mimeType.startsWith("image/") || mimeType == PDF)) {
                return Document
            }
            if (looksLikeText(head) || legacyText(head, mimeType)) {
                return if (ext in MARKDOWN) Markdown else Text
            }
            if (mimeType != null &&
                (mimeType.startsWith("video/") || mimeType.startsWith("audio/"))
            ) {
                return Media
            }
            return Document
        }

        /**
         * No NUL bytes and valid UTF-8, forgiving a multi-byte character cut off at the
         * end of the sample.
         */
        fun looksLikeText(head: ByteArray): Boolean {
            val sample = head.copyOf(minOf(head.size, SAMPLE_BYTES))
            if (sample.contains(0)) return false
            return (0..minOf(3, sample.size)).any { cut -> isUtf8(sample, sample.size - cut) }
        }

        /**
         * A file named as text whose bytes aren't UTF-8 (Latin-1, Windows-1252): the
         * iPhone's Quick Look opens these, so the text view does here.
         */
        private fun legacyText(head: ByteArray, mimeType: String?): Boolean =
            mimeType?.startsWith("text/") == true &&
                !head.copyOf(minOf(head.size, SAMPLE_BYTES)).contains(0)

        /** UTF-8 when the bytes are, Windows-1252 otherwise, so no character is lost. */
        fun decode(bytes: ByteArray): String =
            if (isUtf8(bytes, bytes.size)) bytes.decodeToString() else String(bytes, LEGACY)

        private val LEGACY = charset("windows-1252")

        private fun isUtf8(bytes: ByteArray, length: Int): Boolean = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes, 0, length))
            true
        } catch (_: CharacterCodingException) {
            false
        }

        private const val PDF = "application/pdf"
    }
}

/** NSString's `lastPathComponent`: the name after the last "/", ignoring trailing ones. */
fun lastPathComponent(path: String): String {
    val trimmed = path.trimEnd('/')
    if (trimmed.isEmpty()) return if (path.isEmpty()) "" else "/"
    return trimmed.substringAfterLast('/')
}

/** NSString's `pathExtension`: what follows the name's last ".", none for a dotfile. */
fun pathExtension(name: String): String {
    val last = lastPathComponent(name)
    val dot = last.lastIndexOf('.')
    return if (dot > 0) last.substring(dot + 1) else ""
}
