package cx.lpm.mobile.core.data.share

import java.io.File
import java.io.IOException
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json

internal val shareJson = Json { ignoreUnknownKeys = true }

/** What this file holds, or null when it's missing or from an older or broken write. */
internal fun <T> File.readJson(serializer: KSerializer<T>): T? = try {
    shareJson.decodeFromString(serializer, readText())
} catch (e: IOException) {
    null
} catch (e: IllegalArgumentException) {
    // Includes SerializationException.
    null
}

/** Replaces this file with [bytes] all at once. Throws [IOException] when it can't. */
internal fun File.writeAtomically(bytes: ByteArray) {
    val tmp = File(parentFile, "$name.tmp")
    tmp.writeBytes(bytes)
    if (!tmp.renameTo(this)) {
        tmp.delete()
        throw IOException("Can't write $this")
    }
}
