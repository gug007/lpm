package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.ShareAgent
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.ShareDirectory
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.ShareProject
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ShareInboxTest {
    private val dir: File = Files.createTempDirectory("lpm-share").toFile()

    private fun share(id: String, createdAt: Long) = PendingShare(
        id = id,
        serverId = "srv-1",
        macName = "Studio Mac",
        project = "storefront",
        projectTitle = "Storefront",
        destination = ShareDestination.Notes,
        agent = "",
        note = "Read later",
        text = "",
        createdAt = createdAt
    )

    @Test
    fun aKeptShareComesBackWithItsImagesOldestFirstUntilRemoved() = runTest {
        val inbox = ShareInbox(File(dir, "share-inbox"), UnconfinedTestDispatcher(testScheduler))
        assertTrue(inbox.all().isEmpty())
        val newer = share("B", createdAt = 2)
        val older = share("A", createdAt = 1)
        inbox.save(newer, listOf(byteArrayOf(1), byteArrayOf(2, 3)))
        inbox.save(older, emptyList())

        assertEquals(listOf(older, newer), inbox.all())
        val images = inbox.images(newer)
        assertEquals(2, images.size)
        assertArrayEquals(byteArrayOf(2, 3), images[1])
        assertTrue(inbox.images(older).isEmpty())

        inbox.remove(newer)
        assertEquals(listOf(older), inbox.all())
        assertTrue(inbox.images(newer).isEmpty())
    }

    @Test
    fun aFolderWithoutItsShareIsntListed() = runTest {
        val root = File(dir, "share-inbox")
        File(root, "half-written").mkdirs()
        File(root, "half-written/image-0.jpg").writeBytes(byteArrayOf(1))
        File(root, "broken").mkdirs()
        File(root, "broken/share.json").writeText("{")
        val inbox = ShareInbox(root, UnconfinedTestDispatcher(testScheduler))
        assertTrue(inbox.all().isEmpty())
    }

    @Test
    fun theDirectoryReadsBackWhatWasSavedAndStartsEmpty() = runTest {
        val store = ShareDirectoryStore(
            File(dir, "share-directory.json"),
            UnconfinedTestDispatcher(testScheduler)
        )
        assertEquals(ShareDirectory(), store.load())
        val directory = ShareDirectory(
            listOf(
                ShareMac(
                    localId = "L-1",
                    serverId = "srv-1",
                    name = "Studio Mac",
                    hosts = listOf("192.168.1.20", "100.64.0.2"),
                    port = 8765,
                    projects = listOf(ShareProject("storefront", "Storefront")),
                    agents = listOf(ShareAgent("claude", "Claude Code"))
                )
            )
        )
        store.save(directory)
        assertEquals(directory, store.load())
    }
}
