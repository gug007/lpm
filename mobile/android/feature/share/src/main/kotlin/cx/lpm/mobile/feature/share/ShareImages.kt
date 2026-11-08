package cx.lpm.mobile.feature.share

import android.content.Context
import android.graphics.BitmapFactory
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.net.toUri
import cx.lpm.mobile.core.ui.decodeImage
import cx.lpm.mobile.core.ui.fitting
import cx.lpm.mobile.core.ui.toJpeg
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Turns a shared stream into the JPEG the Mac gets, and one of those into a thumbnail. */
interface ShareImages {
    /** The stream as a JPEG, or null when it isn't an image. */
    suspend fun encode(stream: String): ByteArray?

    /** A small picture of a JPEG [encode] made, for the sheet's row. */
    suspend fun thumbnail(jpeg: ByteArray): ImageBitmap?
}

/**
 * [ShareImages] over the content resolver (iOS `SharedItems.resized`): decoded upright,
 * scaled so the longer side is at most 2048 px, saved as a JPEG at quality 80.
 */
class AndroidShareImages @Inject constructor(
    @param:ApplicationContext private val context: Context
) : ShareImages {
    private val resolver get() = context.contentResolver

    override suspend fun encode(stream: String): ByteArray? = withContext(Dispatchers.IO) {
        val uri = stream.toUri()
        val type = try {
            resolver.getType(uri)
        } catch (_: SecurityException) {
            null
        }
        if (type != null && !type.startsWith("image/")) return@withContext null
        resolver.decodeImage(uri, MAX_DIMENSION)?.toJpeg(JPEG_QUALITY)
    }

    override suspend fun thumbnail(jpeg: ByteArray): ImageBitmap? =
        withContext(Dispatchers.Default) {
            BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
                ?.fitting(THUMBNAIL_MAX_DIMENSION)
                ?.asImageBitmap()
        }

    private companion object {
        const val MAX_DIMENSION = 2048
        const val THUMBNAIL_MAX_DIMENSION = 240
        const val JPEG_QUALITY = 80
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface ShareModule {
    @Binds
    fun shareImages(impl: AndroidShareImages): ShareImages
}
