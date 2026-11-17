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
    private fun TestScope.twoMacs(
        vararg extra: MacRecord,
        h: SessionHarness = SessionHarness(this)
    ): Setup {
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
    fun `another machine paired here stays unticked until it is picked`() = runTest {
        val s = twoMacs()
        val sockets = s.h.transport.sockets.size
        assertTrue(s.feeds.choices.value.ticked.isEmpty())
        assertEquals(setOf(s.h.session.state.value.activeMacId), s.feeds.shownIds.first())
        assertEquals(sockets, s.h.transport.sockets.size)
        assertTrue(s.feeds.listedSections.first().isEmpty())
    }

    @Test
    fun `Show All Machines left on keeps every machine ticked`() = runTest {
        val h = SessionHarness(this)
        h.prefs.setBool(PreferenceKeys.ALL_MACHINES, true)
        val s = twoMacs(h = h)
        assertTrue(s.other.localId in s.feeds.shownIds.first())
        assertEquals("saved:" + s.other.localId, s.feeds.listedSections.first().single().id)
    }

    @Test
    fun `clearing the live Mac moves to the next ticked machine, and the last stays`() = runTest {
        val s = twoMacs()
        val live = s.h.session.state.value.activeMacId!!
        s.feeds.toggle(live)
        settle()
        assertEquals(live, s.h.session.state.value.activeMacId)

        s.feeds.toggle(s.other.localId)
        settle()
        s.feeds.toggle(live)
        settle()
        assertEquals(s.other.localId, s.h.session.state.value.activeMacId)
        assertEquals(setOf(s.other.localId), s.feeds.shownIds.first())
    }

    @Test
    fun `a saved machine lists its projects read-only, away, and follows their changes`() =
        runTest {
            val s = twoMacs()
            s.h.prober.reachable += "192.168.1.30"
            s.feeds.toggle(s.other.localId)
            settle()
            assertTrue(s.other.localId in s.feeds.choices.value.ticked)
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

            s.feeds.toggle(s.other.localId)
            settle()
            assertTrue(s.feeds.listedSections.first().isEmpty())
            assertTrue(s.feeds.feeds.value.isEmpty())
        }

    @Test
    fun `a machine that doesn't answer is probed again after a growing wait`() = runTest {
        val s = twoMacs()
        s.feeds.toggle(s.other.localId)
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
    fun `a machine paired here lists over its own connection, not through the live Mac`() =
        runTest {
            val through = record("10.0.0.5", "srv-3", "Pi", MacVia(macId = "x", slug = "pi"))
            val s = twoMacs(through)
            val box =
                """{"slug":"build-box","name":"Build Box","serverId":"srv-2","state":"ready",""" +
                    """"projects":[{"name":"api"}]}"""
            s.h.transport.sockets.first().receive("""{"t":"machines","machines":[$box]}""")
            settle()
            val listed = s.feeds.listedSections.first().single()
            assertEquals("saved:" + s.other.localId, listed.id)
            assertEquals(listOf("api"), listed.rows.map { it.project.name })
            assertEquals(setOf(s.other.localId), s.feeds.feeds.value.keys)

            s.feeds.toggle(s.other.localId)
            settle()
            assertTrue(s.feeds.listedSections.first().isEmpty())
            assertEquals(setOf(s.other.localId), s.feeds.choices.value.cleared)
        }
}
