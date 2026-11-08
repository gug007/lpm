package cx.lpm.mobile.feature.notes.composer

import android.content.Context
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.net.toUri
import cx.lpm.mobile.core.ui.decodeImage
import cx.lpm.mobile.core.ui.fitting
import cx.lpm.mobile.core.ui.toJpeg
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.ByteArrayOutputStream
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** [NoteMedia] over the content resolver and the bitmap codecs. */
@Singleton
class AndroidNoteMedia @Inject constructor(@param:ApplicationContext private val context: Context) :
    NoteMedia {
    private val resolver get() = context.contentResolver

    override suspend fun displayName(uri: String): String = withContext(Dispatchers.IO) {
        val parsed = uri.toUri()
        val name = runCatching {
            resolver.query(parsed, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
                ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
        }.getOrNull()
        name?.takeIf { it.isNotBlank() } ?: parsed.lastPathSegment ?: "file"
    }

    override suspend fun mimeType(uri: String): String = withContext(Dispatchers.IO) {
        resolver.getType(uri.toUri())
            ?: MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(displayName(uri).substringAfterLast('.', "").lowercase())
            ?: "application/octet-stream"
    }

    override suspend fun encodeImage(uri: String): EncodedNoteImage? =
        withContext(Dispatchers.Default) {
            val image = resolver.decodeImage(uri.toUri(), UPLOAD_MAX_DIMENSION)
                ?: return@withContext null
            val jpeg = image.toJpeg(JPEG_QUALITY) ?: return@withContext null
            EncodedNoteImage(jpeg, image.fitting(THUMBNAIL_MAX_DIMENSION).asImageBitmap())
        }

    override suspend fun readFile(uri: String, limit: Int): NoteFileRead =
        withContext(Dispatchers.IO) {
            try {
                resolver.openInputStream(uri.toUri())?.use { input ->
                    val out = ByteArrayOutputStream()
                    val buffer = ByteArray(BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        out.write(buffer, 0, read)
                        if (out.size() > limit) return@withContext NoteFileRead.TooLarge
                    }
                    NoteFileRead.Bytes(out.toByteArray())
                } ?: NoteFileRead.Unreadable
            } catch (_: IOException) {
                NoteFileRead.Unreadable
            } catch (_: SecurityException) {
                NoteFileRead.Unreadable
            }
        }

    override suspend fun discardCapture(uri: String) {
        withContext(Dispatchers.IO) { runCatching { resolver.delete(uri.toUri(), null, null) } }
    }

    private companion object {
        const val UPLOAD_MAX_DIMENSION = 2048
        const val THUMBNAIL_MAX_DIMENSION = 240
        const val JPEG_QUALITY = 70
        const val BUFFER_SIZE = 64 * 1024
    }
}
