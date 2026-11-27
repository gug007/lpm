package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.model.PendingShare
import java.io.File
import java.io.IOException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.withContext

/**
 * Shares the sheet couldn't deliver (iOS `ShareInbox`), kept with their images until
 * the app reaches their Mac: a folder per share under [root].
 */
class ShareInbox(private val root: File, private val io: CoroutineDispatcher) {
    /** Throws [IOException] when the share can't be kept. */
    suspend fun save(share: PendingShare, images: List<ByteArray>) = withContext(io) {
        val folder = folder(share)
        if (!folder.isDirectory && !folder.mkdirs()) throw IOException("Can't make $folder")
        images.forEachIndexed { index, image -> image(folder, index).writeAtomically(image) }
        // Last, so a share is only listed once its images are all there.
        File(folder, SHARE_FILE).writeAtomically(
            shareJson.encodeToString(PendingShare.serializer(), share).toByteArray()
        )
    }

    /** Every waiting share, oldest first. */
    suspend fun all(): List<PendingShare> = withContext(io) {
        root.listFiles().orEmpty().mapNotNull {
            File(it, SHARE_FILE).readJson(PendingShare.serializer())
        }.sortedBy { it.createdAt }
    }

    suspend fun images(share: PendingShare): List<ByteArray> = withContext(io) {
        val folder = folder(share)
        val images = mutableListOf<ByteArray>()
        while (true) {
            val file = image(folder, images.size)
            images += try {
                file.readBytes()
            } catch (e: IOException) {
                break
            }
        }
        images
    }

    /** Keeps a share the Mac turned down, with why ([failure]), or puts it back in line (null). */
    suspend fun markFailed(share: PendingShare, failure: String?) = withContext(io) {
        val file = File(folder(share), SHARE_FILE)
        if (!file.exists()) return@withContext
        file.writeAtomically(
            shareJson.encodeToString(PendingShare.serializer(), share.copy(failure = failure))
                .toByteArray()
        )
    }

    /** A share the Mac turned down, back in line to be sent (its notification's Retry). */
    suspend fun retry(id: String) {
        val share = all().firstOrNull { it.id == id } ?: return
        markFailed(share, null)
    }

    suspend fun remove(share: PendingShare) {
        withContext(io) { folder(share).deleteRecursively() }
    }

    private fun folder(share: PendingShare) = File(root, share.id)

    private fun image(folder: File, index: Int) = File(folder, "image-$index.jpg")

    private companion object {
        const val SHARE_FILE = "share.json"
    }
}
