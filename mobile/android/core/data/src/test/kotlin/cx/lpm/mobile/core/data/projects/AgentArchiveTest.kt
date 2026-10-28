package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.terminals.UNDO_CLOSE_MS
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.projectAgentList
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AgentArchiveTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun entry(key: String, value: String, pane: String, seenAt: Long = 0) =
        """{"key":"$key","value":"$value","priority":20,"timestamp":1000,"paneID":"$pane",""" +
            """"endedAt":1000,"seenAt":$seenAt}"""

    private fun FakeSocket.projects(
        status: List<String>,
        seen: List<String> = emptyList(),
        keep: Boolean = true
    ) = receive(
        """{"t":"projects","seenAgentsShown":2,"keepFinishedAgents":$keep,""" +
            """"projects":[{"name":"storefront","statusEntries":[${status.joinToString(",")}],""" +
            """"seenEntries":[${seen.joinToString(",")}]}]}"""
    )

    private fun SessionHarness.connectArchiving(keep: Boolean = true): FakeSocket {
        val socket = connectReady(listOf(LpmClient.AGENT_ARCHIVE_FEATURE))
        socket.projects(
            status = listOf(
                entry("codex_t1", "Done", "t1"),
                entry("claude_code_t2", "Running", "t2")
            ),
            seen = listOf(entry("omp_t3", "Error", "t3", seenAt = 500)),
            keep = keep
        )
        return socket
    }

    private fun SessionHarness.row(id: String): ProjectAgentRow =
        projectAgentList(projects.state.value.project("storefront")!!, 2_000, emptyMap())
            .first { id in it.keys }

    private fun SessionHarness.keys(seen: Boolean = false) =
        projects.state.value.project("storefront")!!.let {
            if (seen) it.seenEntries else it.statusEntries
        }
            .map { it.key }

    @Test
    fun `the projects reply carries how many seen agents to list`() = runTest {
        val h = SessionHarness(this)
        h.connectArchiving()
        settle()
        assertEquals(2, h.projects.state.value.seenAgentsShown)
        assertEquals(listOf("omp_t3"), h.keys(seen = true))
    }

    @Test
    fun `opening a finished agent keeps it as seen while the Mac does`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectArchiving()
        settle()
        h.projects.markTerminalSeen("storefront", "t1")
        assertEquals(listOf("claude_code_t2"), h.keys())
        assertEquals(listOf("omp_t3", "codex_t1"), h.keys(seen = true))
        val seen = h.projects.state.value.project("storefront")!!.seenEntries.last()
        assertEquals(h.clock.millis(), seen.seenAt)
        assertEquals("Done", socket.sentOf("clearStatus").single().string("value"))
    }

    @Test
    fun `with Keep finished agents off, opening drops the agent and archiving still works`() =
        runTest {
            val h = SessionHarness(this)
            val socket = h.connectArchiving(keep = false)
            settle()
            assertFalse(h.projects.state.value.keepFinishedAgents)
            h.projects.markTerminalSeen("storefront", "t1")
            assertEquals(listOf("claude_code_t2"), h.keys())
            assertEquals(listOf("omp_t3"), h.keys(seen = true))
            assertEquals("Done", socket.sentOf("clearStatus").single().string("value"))
            h.projects.archiveAgent(h.row("omp_t3"), "storefront")
            assertEquals(setOf("omp_t3"), h.projects.state.value.archivingAgentKeys("storefront"))
        }

    @Test
    fun `a Mac without agentArchive drops finished agents on open`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        socket.projects(status = listOf(entry("codex_t1", "Done", "t1")))
        settle()
        h.projects.archiveAgent(h.row("codex_t1"), "storefront")
        assertNull(h.projects.state.value.pendingAgentArchive)
        h.projects.markTerminalSeen("storefront", "t1")
        assertTrue(h.keys().isEmpty())
        assertTrue(h.keys(seen = true).isEmpty())
    }

    @Test
    fun `an archive hides the row and reaches the Mac once the undo window passes`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectArchiving()
        settle()
        h.projects.archiveAgent(h.row("omp_t3"), "storefront")
        h.projects.archiveAgent(h.row("codex_t1"), "storefront")
        val pending = h.projects.state.value.pendingAgentArchive!!
        assertEquals(2, pending.agents.size)
        assertEquals(
            setOf("omp_t3", "codex_t1"),
            h.projects.state.value.archivingAgentKeys("storefront")
        )
        settle(UNDO_CLOSE_MS - 1)
        assertTrue(socket.sentOf("archiveStatus").isEmpty())
        settle(1)
        val sent = socket.sentOf("archiveStatus").single()
        assertEquals(listOf("omp_t3", "codex_t1"), sent.strings("keys"))
        assertEquals(listOf("claude_code_t2"), h.keys())
        assertTrue(h.keys(seen = true).isEmpty())
        assertNull(h.projects.state.value.pendingAgentArchive)
    }

    @Test
    fun `undo lists the agent again and the Mac never hears of it`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectArchiving()
        settle()
        h.projects.archiveAgent(h.row("omp_t3"), "storefront")
        h.projects.undoAgentArchive()
        assertTrue(h.projects.state.value.archivingAgentKeys("storefront").isEmpty())
        settle(UNDO_CLOSE_MS * 2)
        assertTrue(socket.sentOf("archiveStatus").isEmpty())
        assertEquals(listOf("omp_t3"), h.keys(seen = true))
    }

    @Test
    fun `a working agent can't be archived`() = runTest {
        val h = SessionHarness(this)
        h.connectArchiving()
        settle()
        h.projects.archiveAgent(h.row("claude_code_t2"), "storefront")
        assertNull(h.projects.state.value.pendingAgentArchive)
    }

    @Test
    fun `leaving the screen sends an archive still waiting on its undo`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectArchiving()
        settle()
        h.projects.archiveAgent(h.row("omp_t3"), "storefront")
        h.session.setInForeground(false)
        assertEquals(1, socket.sentOf("archiveStatus").size)
        assertNull(h.projects.state.value.pendingAgentArchive)
    }

    @Test
    fun `mark as seen and mark as unread move an agent between the lists`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectArchiving()
        settle()
        h.projects.markAgentSeen(h.row("codex_t1"), "storefront")
        assertEquals(listOf("codex_t1"), socket.sentOf("markStatusSeen").single().strings("keys"))
        assertEquals(listOf("omp_t3", "codex_t1"), h.keys(seen = true))

        h.projects.markAgentUnread(h.row("omp_t3"), "storefront")
        assertEquals(listOf("omp_t3"), socket.sentOf("markStatusUnread").single().strings("keys"))
        assertEquals(listOf("claude_code_t2", "omp_t3"), h.keys())
        assertEquals(0L, h.projects.state.value.project("storefront")!!.statusEntries.last().seenAt)
    }

    @Test
    fun `a status reply brings the seen agents with it`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectArchiving()
        settle()
        socket.receive(
            """{"t":"status","project":"storefront","status":[],""" +
                """"seen":[${entry("codex_t1", "Done", "t1", seenAt = 900)}]}"""
        )
        settle()
        assertTrue(h.keys().isEmpty())
        assertEquals(listOf("codex_t1"), h.keys(seen = true))
    }
}
