package cx.lpm.mobile.feature.share

import androidx.compose.ui.graphics.ImageBitmap
import cx.lpm.mobile.core.data.share.ShareChoices
import cx.lpm.mobile.core.data.share.ShareDelivery
import cx.lpm.mobile.core.data.share.ShareDirectoryStore
import cx.lpm.mobile.core.data.share.ShareInbox
import cx.lpm.mobile.core.model.ShareAgent
import cx.lpm.mobile.core.model.ShareDirectory
import cx.lpm.mobile.core.model.ShareMac
import cx.lpm.mobile.core.model.ShareProject
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.settle
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher

val studio = ShareMac(
    localId = "L-1",
    serverId = "srv-1",
    name = "Studio Mac",
    hosts = listOf("192.168.1.20"),
    port = 8765,
    projects = listOf(ShareProject("storefront", "Storefront"), ShareProject("api", "")),
    agents = listOf(ShareAgent("claude", "Claude Code"), ShareAgent("codex", "Codex"))
)

val mini = ShareMac(
    localId = "L-2",
    serverId = "srv-2",
    name = "Mac mini",
    hosts = listOf("10.0.0.5"),
    port = 8765,
    projects = listOf(ShareProject("blog", "Blog"))
)

/** The share sheet's stores over a [TestSession]'s fakes, files in a fresh folder. */
@OptIn(ExperimentalCoroutinesApi::class)
class ShareFixture(private val test: TestScope, macs: List<ShareMac> = listOf(studio, mini)) {
    val t = TestSession(test)
    private val dir: File = Files.createTempDirectory("lpm-share").toFile()
    private val io = UnconfinedTestDispatcher(test.testScheduler)
    val directories = ShareDirectoryStore(File(dir, "share-directory.json"), io)
    val inbox = ShareInbox(File(dir, "share-inbox"), io)
    val choices = ShareChoices(t.prefs)
    val delivery = ShareDelivery(t.credentials, t.clients, t.prober, t.device)

    /** What the image encoder turns each stream into; others aren't images. */
    val encoded = mutableMapOf<String, ByteArray>()

    /** The JPEGs a thumbnail was made of. */
    val thumbnailed = mutableListOf<ByteArray>()

    init {
        runBlocking {
            t.prefs.load()
            directories.save(ShareDirectory(macs))
        }
        macs.forEach { t.credentials.save("dev-${it.serverId}", "tok-${it.serverId}", it.localId) }
    }

    fun viewModel() = ShareViewModel(
        directories,
        choices,
        delivery,
        inbox,
        object : ShareImages {
            override suspend fun encode(stream: String): ByteArray? = encoded[stream]

            override suspend fun thumbnail(jpeg: ByteArray): ImageBitmap? {
                thumbnailed += jpeg
                return null
            }
        },
        t.clock
    )

    /** The share's own link to the Mac, signed in. */
    fun signIn(serverId: String = "srv-1"): FakeSocket {
        test.settle()
        val link = t.transport.last
        link.open()
        test.settle()
        link.receive("""{"t":"ready","serverId":"$serverId"}""")
        test.settle()
        return link
    }
}
