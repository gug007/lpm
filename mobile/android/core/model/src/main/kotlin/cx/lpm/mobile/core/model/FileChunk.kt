package cx.lpm.mobile.core.model

import java.util.Base64
import kotlinx.serialization.json.JsonObject

/**
 * One `fileChunk` reply: a byte range of a file on the Mac, plus the file's current
 * size and mtime so a fetch can tell it changed between ranges. The base64 decode
 * happens here, on the client's parse thread.
 */
class FileChunk(
    val reqId: String,
    val path: String,
    val size: Long,
    val mtime: Long,
    val offset: Long,
    val data: ByteArray,
    val error: String?,
    /** The file isn't there — the cue to try the next reading of a tapped path. */
    val missing: Boolean,
    /** Where the file sits in the project ("" outside it); null from a Mac that predates it. */
    val projectPath: String? = null
) {
    companion object {
        private const val UNREADABLE = "Couldn't read the file."

        fun parse(o: JsonObject): FileChunk {
            val ok = o.bool("ok") ?: false
            val decoded = if (ok) decodeBase64(o.string("data").orEmpty()) else null
            return FileChunk(
                reqId = o["reqId"].reqIdString(),
                path = o.string("path").orEmpty(),
                size = o.numberLong("size") ?: 0,
                mtime = o.numberLong("mtime") ?: 0,
                offset = o.numberLong("offset") ?: 0,
                data = decoded ?: ByteArray(0),
                error = when {
                    !ok -> o.string("error") ?: UNREADABLE
                    decoded == null -> UNREADABLE
                    else -> null
                },
                missing = o.bool("missing") ?: false,
                projectPath = o.string("projectPath")
            )
        }

        private fun decodeBase64(text: String): ByteArray? = runCatching {
            Base64.getDecoder().decode(text)
        }.getOrNull()
    }
}
