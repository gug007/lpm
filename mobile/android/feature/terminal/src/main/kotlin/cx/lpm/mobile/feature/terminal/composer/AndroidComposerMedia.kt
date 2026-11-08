package cx.lpm.mobile.feature.terminal.composer

import android.content.Context
import android.media.MediaMetadataRetriever
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.net.toUri
import cx.lpm.mobile.core.ui.decodeImage
import cx.lpm.mobile.core.ui.fitting
import cx.lpm.mobile.core.ui.toJpeg
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.util.Base64
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** [ComposerMedia] over the content resolver, the bitmap codecs and a cache folder. */
@Singleton
class AndroidComposerMedia @Inject constructor(
    @param:ApplicationContext private val context: Context
) : ComposerMedia {
    private val resolver get() = context.contentResolver

    /** Emptied on first use each launch: anything still here was left by a run that ended mid-upload. */
    private val root: File by lazy {
        File(context.cacheDir, SCRATCH_FOLDER).apply { deleteRecursively() }
    }

    override fun isVideo(source: PickedUri): Boolean =
        resolver.getType(source.value.toUri())?.startsWith("video/") == true

    override fun displayName(source: PickedUri): String {
        val uri = source.value.toUri()
        val name = runCatching {
            resolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null
            )?.use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        }.getOrNull()
        return name?.takeIf { it.isNotBlank() } ?: uri.lastPathSegment ?: "file"
    }

    override fun encodeImage(source: PickedUri): EncodedImage? {
        val image = resolver.decodeImage(source.value.toUri(), UPLOAD_MAX_DIMENSION) ?: return null
        val jpeg = image.toJpeg(JPEG_QUALITY) ?: return null
        return EncodedImage(
            b64 = Base64.getEncoder().encodeToString(jpeg),
            thumbnail = image.fitting(THUMBNAIL_MAX_DIMENSION).asImageBitmap()
        )
    }

    override fun copyToScratch(source: PickedUri): File? = try {
        val dir = File(root, UUID.randomUUID().toString()).apply { mkdirs() }
        val dest = File(dir, displayName(source).replace('/', '_'))
        resolver.openInputStream(source.value.toUri())?.use { input ->
            dest.outputStream().use { input.copyTo(it) }
        } ?: return null
        dest
    } catch (_: IOException) {
        null
    } catch (_: SecurityException) {
        null
    }

    override fun mime(file: File): String =
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())
            ?: "application/octet-stream"

    override fun videoThumbnail(file: File): ImageBitmap? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.path)
            retriever.getFrameAtTime(0)?.fitting(THUMBNAIL_MAX_DIMENSION)?.asImageBitmap()
        } catch (_: RuntimeException) {
            null
        } finally {
            retriever.release()
        }
    }

    override fun size(file: File): Long? = file.takeIf { it.isFile }?.length()

    override fun readPiece(file: File, offset: Long, length: Long): ByteArray? = try {
        RandomAccessFile(file, "r").use { handle ->
            handle.seek(offset)
            ByteArray(length.toInt()).also(handle::readFully)
        }
    } catch (_: IOException) {
        null
    }

    override fun readAll(file: File): ByteArray? = try {
        file.readBytes()
    } catch (_: IOException) {
        null
    }

    override fun discard(file: File) {
        file.parentFile?.deleteRecursively()
    }

    private companion object {
        const val SCRATCH_FOLDER = "ComposerUploads"
        const val UPLOAD_MAX_DIMENSION = 2048
        const val THUMBNAIL_MAX_DIMENSION = 240
        const val JPEG_QUALITY = 70
    }
}
