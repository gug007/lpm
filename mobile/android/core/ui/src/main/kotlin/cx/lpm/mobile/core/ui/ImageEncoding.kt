package cx.lpm.mobile.core.ui

import android.content.ContentResolver
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import androidx.core.graphics.scale
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The image at [uri] decoded upright and no larger than [maxDimension] on its longer
 * side, or null when it can't be read.
 */
fun ContentResolver.decodeImage(uri: Uri, maxDimension: Int): Bitmap? = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(this, uri)) { decoder, info, _ ->
            val longest = max(info.size.width, info.size.height)
            if (longest > maxDimension) {
                val ratio = maxDimension.toFloat() / longest
                decoder.setTargetSize(
                    (info.size.width * ratio).roundToInt(),
                    (info.size.height * ratio).roundToInt()
                )
            }
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        openInputStream(uri)?.use(BitmapFactory::decodeStream)?.fitting(maxDimension)
    }
} catch (_: IOException) {
    null
} catch (_: SecurityException) {
    null
}

/** This image as a JPEG at [quality] (0–100), or null when it can't be compressed. */
fun Bitmap.toJpeg(quality: Int): ByteArray? {
    val jpeg = ByteArrayOutputStream()
    return if (compress(Bitmap.CompressFormat.JPEG, quality, jpeg)) jpeg.toByteArray() else null
}

/** This image, scaled down if it must be to at most [maxDimension] on its longer side. */
fun Bitmap.fitting(maxDimension: Int): Bitmap {
    val longest = max(width, height)
    if (longest <= maxDimension) return this
    val ratio = maxDimension.toFloat() / longest
    return scale((width * ratio).roundToInt(), (height * ratio).roundToInt())
}
