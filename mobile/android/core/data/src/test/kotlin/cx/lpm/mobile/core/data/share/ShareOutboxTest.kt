package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacVia
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.PendingShare
import cx.lpm.mobile.core.model.ShareDestination
import cx.lpm.mobile.core.model.string
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ShareOutboxTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun share(id: String, serverId: String, createdAt: Long) = PendingShare(
        id = id,
        serverId = serverId,
        macName = "Old name",
        project = "storefront",
        projectTitle = "Storefront",
        destination = ShareDestination.Notes,
        agent = "",
        note = "Read later",
        text = "",
        createdAt = createdAt
    )

    private fun record(serverId: String, host: String, via: MacVia? = null) = MacRecord(
        localId = "L-$serverId",
        serverId = serverId,
        name = "Mac $serverId",
        hosts = listOf(host),
        port = 8765,
        via = via
    )

    @Test
    fun eachWaitingShareIsSentToItsMacAndToldAbout() = runTest {
        val h = SessionHarness(this)
        val inbox = ShareInbox(
            Files.createTempDirectory("lpm-inbox").toFile().let { File(it, "share-inbox") },
            UnconfinedTestDispatcher(testScheduler)
        )
        val outbox = ShareOutbox(
            inbox,
            ShareDelivery(h.credentials, h.clients, h.prober, ThisDevice("Test Phone"))
        )
        val reached = record("srv-1", "192.168.1.20")
        val asleep = record("srv-2", "192.168.1.30")
        val throughAnother = record("srv-3", "192.168.1.40", via = MacVia("L-srv-1", "mini"))
        listOf(reached, asleep, throughAnother).forEach {
            h.credentials.save("dev", "tok", it.localId)
        }
        h.prober.reachable += "192.168.1.20"
        inbox.save(share("A", "srv-1", createdAt = 1), emptyList())
        inbox.save(share("B", "srv-2", createdAt = 2), emptyList())
        inbox.save(share("C", "srv-9", createdAt = 3), emptyList())
        inbox.save(share("D", "srv-3", createdAt = 4), emptyList())
        inbox.save(share("E", "srv-1", createdAt = 5), emptyList())
        inbox.save(share("F", "srv-2", createdAt = 6), emptyList())

        val told = mutableListOf<Pair<String, String?>>()
        val sweep = launch {
            outbox.sendWaiting(listOf(reached, asleep, throughAnother)) { share, failure ->
                told += share.id to failure
            }
        }
        settle()
        var link = h.transport.last
        link.open()
        settle()
        link.receive("""{"t":"ready","serverId":"srv-1"}""")
        settle()
        link.receive(
            """{"t":"notesChats","project":"storefront","ok":true,"chats":[{"id":"c-1"}]}"""
        )
        settle()
        val note = link.sentOf("notesAddMessage").single()
        link.receive("""{"t":"notesAddMessage","ok":true,"reqId":"${note.string("reqId")}"}""")
        settle()
        // B's Mac doesn't answer; C's and D's are gone or reached through another Mac.
        link = h.transport.last
        link.open()
        settle()
        link.receive("""{"t":"ready","serverId":"srv-1"}""")
        settle()
        assertEquals("storefront", link.sentOf("notesChats").single().string("project"))
        link.receive(
            """{"t":"notesChats","project":"storefront","ok":false,"error":"No notes here."}"""
        )
        settle()
        sweep.join()

        assertEquals(listOf("A" to null, "E" to "No notes here."), told)
        assertEquals(listOf("B", "F"), inbox.all().map { it.id })
        // F waits with B, without dialling its Mac again.
        assertEquals(1, h.prober.probed.count { it == "192.168.1.30" })
        assertEquals(2, h.transport.sockets.size)
        assertTrue(h.transport.sockets.all { it.closed })
    }
}
