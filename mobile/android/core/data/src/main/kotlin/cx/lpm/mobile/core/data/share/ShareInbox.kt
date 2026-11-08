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

    suspend fun remove(share: PendingShare) {
        withContext(io) { folder(share).deleteRecursively() }
    }

    private fun folder(share: PendingShare) = File(root, share.id)

    private fun image(folder: File, index: Int) = File(folder, "image-$index.jpg")

    private companion object {
        const val SHARE_FILE = "share.json"
    }
}
