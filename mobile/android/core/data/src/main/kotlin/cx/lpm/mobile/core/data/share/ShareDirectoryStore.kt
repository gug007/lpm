package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.model.ShareDirectory
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/**
 * The share sheet's directory on disk (iOS `share-directory.json` in the app group):
 * written as the app learns each Mac's projects, read when something is shared.
 */
class ShareDirectoryStore(private val file: File, private val io: CoroutineDispatcher) {
    suspend fun load(): ShareDirectory = withContext(io) {
        file.readJson(ShareDirectory.serializer()) ?: ShareDirectory()
    }

    suspend fun save(directory: ShareDirectory) {
        withContext(io) {
            try {
                file.parentFile?.mkdirs()
                file.writeAtomically(
                    shareJson.encodeToString(ShareDirectory.serializer(), directory).toByteArray()
                )
            } catch (e: IOException) {
                file.delete()
            }
        }
    }
}
