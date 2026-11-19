package cx.lpm.mobile.feature.files.preview

import cx.lpm.mobile.feature.files.fetch.FilePreviewKind
import java.io.File
import java.security.MessageDigest

/** What the file editor opens: the text, and the hash the Mac checks a save against. */
internal object FileEdit {
    /** The largest file the preview offers to edit. */
    const val MAX_BYTES = 200L * 1024

    class Opened(val text: String, val base: String, val unreadable: Boolean)

    fun open(file: File): Opened {
        val bytes = runCatching { file.readBytes() }.getOrNull() ?: return Opened("", "", true)
        val text = decode(bytes) ?: return Opened("", "", true)
        return Opened(text, sha256(bytes), false)
    }

    /** The bytes as UTF-8, or null for anything that isn't. */
    fun decode(bytes: ByteArray): String? = FilePreviewKind.utf8OrNull(bytes)

    fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
