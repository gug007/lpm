package cx.lpm.mobile.core.data.machines

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacVia
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.bool
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PairedMachineFeedsTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun record(host: String, serverId: String, name: String, via: MacVia? = null) =
        MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = serverId,
            name = name,
            hosts = listOf(host),
            port = 8765,
            via = via
        )

    private class Setup(val h: SessionHarness, val feeds: PairedMachineFeeds, val other: MacRecord)

    /** The live Mac at .20 and another machine paired here at .30. */
    private fun TestScope.twoMacs(vararg extra: MacRecord): Setup {
        val h = SessionHarness(this)
        val live = record("192.168.1.20", "srv-1", "Studio Mac")
        val other = record("192.168.1.30", "srv-2", "Build Box")
        h.macStore.saveRecords(listOf(live, other) + extra)
        h.macStore.saveActiveId(live.localId)
        h.credentials.save("dev-1", "tok-1", live.localId)
        h.credentials.save("dev-2", "tok-2", other.localId)
        h.session.bootstrap()
        settle()
        val socket = h.transport.last
        socket.open()
        settle()
        socket.receive("""{"t":"ready","serverId":"srv-1","serverName":"Studio Mac"}""")
        settle()
        val feeds = PairedMachineFeeds(
            h.session,
            h.prefs,
            h.credentials,
            h.clients,
            h.prober,
            ThisDevice("Test Phone"),
            backgroundScope
        )
        settle()
        return Setup(h, feeds, other)
    }

    private fun FakeSocket.ready() {
        open()
        receive("""{"t":"ready","serverId":"srv-2","serverName":"Build Box"}""")
    }

    @Test
    fun `off by default, and offered once another machine is paired here`() = runTest {
        val (h, feeds) = twoMacs().let { it.h to it.feeds }
        val sockets = h.transport.sockets.size
        assertFalse(feeds.enabled.value)
        assertTrue(h.session.state.value.canShowAllMachines())
        assertEquals(sockets, h.transport.sockets.size)
        assertTrue(feeds.listedSections.first().isEmpty())
    }

    @Test
    fun `a saved machine lists its projects read-only, away, and follows their changes`() =
        runTest {
            val s = twoMacs()
            s.h.prober.reachable += "192.168.1.30"
            s.feeds.setEnabled(true)
            settle()
            assertEquals(true, s.h.prefs.bool(PreferenceKeys.ALL_MACHINES))
            val connecting = s.feeds.listedSections.first().single()
            assertEquals("saved:" + s.other.localId, connecting.id)
            assertEquals("Build Box", connecting.machine.name)
            assertEquals(MachineFeedNote.Connecting, connecting.note)

            val socket = s.h.transport.last
            assertTrue(socket.url.contains("192.168.1.30"))
            socket.ready()
            settle()
            assertEquals(false, socket.sentOf("presence").last().bool("active"))
            assertEquals(1, socket.sentOf("projects").size)
            assertTrue(socket.sentOf("sub").isEmpty())

            socket.receive("""{"t":"projects","projects":[{"name":"api"},{"name":"worker"}]}""")
            settle()
            val ready = s.feeds.listedSections.first().single()
            assertNull(ready.note)
            assertEquals(listOf("api", "worker"), ready.rows.map { it.project.name })
            assertEquals(ready, s.feeds.section(ready.id))

            socket.receive("""{"t":"projects-changed"}""")
            socket.receive("""{"t":"status-changed","project":"api"}""")
            settle(399)
            assertEquals(1, socket.sentOf("projects").size)
            settle(1)
            assertEquals(2, socket.sentOf("projects").size)

            s.feeds.setEnabled(false)
            settle()
            assertTrue(s.feeds.listedSections.first().isEmpty())
            assertTrue(s.feeds.feeds.value.isEmpty())
        }

    @Test
    fun `a machine that doesn't answer is probed again after a growing wait`() = runTest {
        val s = twoMacs()
        s.feeds.setEnabled(true)
        settle()
        assertEquals(MachineFeedNote.NotAnswering, s.feeds.listedSections.first().single().note)
        val probes = { s.h.prober.probed.count { it == "192.168.1.30" } }
        assertEquals(1, probes())
        settle(5_000)
        assertEquals(2, probes())
        settle(14_999)
        assertEquals(2, probes())
        settle(1)
        assertEquals(3, probes())

        s.h.prober.reachable += "192.168.1.30"
        s.h.session.setInForeground(false)
        settle()
        assertTrue(s.feeds.feeds.value.isEmpty())
        s.h.session.setInForeground(true)
        settle()
        assertEquals(4, probes())
    }

    @Test
    fun `machines carried through another Mac or shown by the live one are left out`() = runTest {
        val through = record("10.0.0.5", "srv-3", "Pi", MacVia(macId = "x", slug = "pi"))
        val s = twoMacs(through)
        val box = """{"slug":"build-box","name":"Build Box","serverId":"srv-2","state":"ready"}"""
        s.h.transport.sockets.first().receive("""{"t":"machines","machines":[$box]}""")
        settle()
        s.feeds.setEnabled(true)
        settle()
        val listed = s.feeds.listedSections.first()
        assertEquals(listOf("build-box"), listed.map { it.id })
        assertTrue(s.feeds.feeds.value.isEmpty())
    }
}
