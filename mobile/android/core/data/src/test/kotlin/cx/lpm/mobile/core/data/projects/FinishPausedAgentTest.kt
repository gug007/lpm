package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.projectAgentRows
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.model.strings
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FinishPausedAgentTest {
    private fun TestScope.settle() = testScheduler.runCurrent()

    private fun FakeSocket.projects() = receive(
        """{"t":"projects","projects":[{"name":"storefront","statusEntries":[""" +
            """{"key":"claude_code_t1","value":"Running","priority":30,"timestamp":1000,""" +
            """"paneID":"t1","turnStart":900,"pausedAt":1500,"shells":["Run the test suite"]},""" +
            """{"key":"codex_t2","value":"Running","priority":30,"timestamp":1000,""" +
            """"paneID":"t2","turnStart":900}]}]}"""
    )

    private fun SessionHarness.row(id: String): ProjectAgentRow =
        projectAgentRows(projects.state.value.project("storefront")!!, 2_000, emptyMap())
            .first { it.id == id }

    @Test
    fun `a paused agent marked finished sends its keys`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.FINISH_PAUSED_FEATURE))
        socket.projects()
        settle()
        assertTrue(h.projects.canFinishPausedAgents)
        val paused = h.row("claude_code_t1")
        assertNotNull(paused.pause)

        h.projects.finishPausedAgent(paused, "storefront")
        val sent = socket.sentOf("finishPaused").single()
        assertEquals("storefront", sent.string("project"))
        assertEquals(listOf("claude_code_t1"), sent.strings("keys"))

        h.projects.finishPausedAgent(h.row("codex_t2"), "storefront")
        assertEquals(1, socket.sentOf("finishPaused").size)
    }

    @Test
    fun `a Mac without finishPaused is never sent it`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.AGENT_ARCHIVE_FEATURE))
        socket.projects()
        settle()
        assertFalse(h.projects.canFinishPausedAgents)
        h.projects.finishPausedAgent(h.row("claude_code_t1"), "storefront")
        assertTrue(socket.sentOf("finishPaused").isEmpty())
    }
}
