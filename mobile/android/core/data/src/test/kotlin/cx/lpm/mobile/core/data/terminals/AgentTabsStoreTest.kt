package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.string
import java.time.Instant
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AgentTabsStoreTest {
    private class Fixture(val h: SessionHarness, val socket: FakeSocket) {
        val store: AgentTabsStore = h.session.store()
        val mac: String get() = h.session.state.value.activeMacId!!

        fun receive(frame: String) {
            socket.receive(frame)
            h.scheduler.runCurrent()
        }

        fun projects(vararg entries: String, remote: Boolean = false) = receive(
            """{"t":"projects","projects":[{"name":"api","label":"api","isRemote":$remote,""" +
                """"statusEntries":[${entries.joinToString(",")}]}]}"""
        )

        fun terminals() = receive(
            """{"t":"terminals","project":"api","terminals":[""" +
                """{"id":"t1","label":"Claude","project":"api","cli":"claude"},""" +
                """{"id":"t2","label":"Shell","project":"api","cli":""}]}"""
        )
    }

    private fun TestScope.ready(
        features: List<String> = listOf(LpmClient.AGENT_ANSWERS_FEATURE)
    ): Fixture {
        val h = SessionHarness(this)
        return Fixture(h, h.connectReady(features = features))
    }

    private fun done(pane: String, ts: Long, key: String = "claude_code_$pane") =
        """{"key":"$key","value":"Done","timestamp":$ts,"paneID":"$pane"}"""

    @Test
    fun `a finished turn's answer is asked for once and kept`() = runTest {
        val f = ready()
        f.terminals()
        f.projects(done("t1", 50))
        settleAlive(f.socket, 3_000)
        val asked = f.socket.sentOf("answers").single()
        assertEquals("t1", asked.string("id"))
        f.receive(
            """{"t":"answers","id":"t1","ok":true,"answers":[{"text":"All done."}],""" +
                """"reqId":"${asked.string("reqId")}"}"""
        )
        assertEquals("All done.", f.store.saved("t1")?.answer?.text)
        assertEquals(Instant.ofEpochMilli(50), f.store.saved("t1")?.lastSeen)
        assertEquals(listOf("t1"), f.store.savedTabs("api").map { it.id })

        f.projects(done("t1", 50), done("t1", 50))
        settleAlive(f.socket, 3_000)
        assertEquals(1, f.socket.sentOf("answers").size)
        f.projects(done("t1", 90))
        settleAlive(f.socket, 3_000)
        assertEquals(2, f.socket.sentOf("answers").size)
    }

    @Test
    fun `an answer whose request was lost is asked for again on reconnecting`() = runTest {
        val f = ready()
        f.projects(done("t1", 50))
        settleAlive(f.socket, 3_000)
        assertEquals(1, f.socket.sentOf("answers").size)
        f.socket.fail()
        f.h.scheduler.runCurrent()
        val features = listOf(LpmClient.AGENT_ANSWERS_FEATURE)
        val again = Fixture(f.h, f.h.connectReady(features = features))
        again.projects(done("t1", 50))
        settleAlive(again.socket, 3_000)
        assertEquals(1, again.socket.sentOf("answers").size)
    }

    @Test
    fun `only transcripts the Mac reads are asked for`() = runTest {
        val f = ready()
        f.projects(done("t1", 5, key = "gemini_t1"))
        f.projects(done("t1", 5), remote = true)
        settleAlive(f.socket, 3_000)
        assertEquals(0, f.socket.sentOf("answers").size)

        val old = ready(features = emptyList())
        old.projects(done("t1", 5))
        settleAlive(old.socket, 3_000)
        assertEquals(0, old.socket.sentOf("answers").size)
    }

    @Test
    fun `an agent's screen is kept for its mac and listed`() = runTest {
        val f = ready()
        f.terminals()
        val (claude, shell) = f.h.terminals.state.value.terminals.getValue("api")
        assertTrue(f.store.keepsScreen(claude))
        assertFalse(f.store.keepsScreen(shell))
        assertTrue(f.store.savedTabs("api").isEmpty())
        f.store.keepScreen("t1", "screen", 9, f.mac)
        f.store.keepScreen("t1", "elsewhere", 10, "unpaired")
        settleAlive(f.socket, 3_000)
        assertEquals("screen", f.store.saved("t1")?.screen?.text)
        assertEquals(listOf("t1"), f.store.savedTabs("api").map { it.id })
        assertNull(f.store.saved("t2"))
    }

    @Test
    fun `removing the mac forgets its tabs`() = runTest {
        val f = ready()
        f.terminals()
        val mac = f.mac
        f.store.keepScreen("t1", "screen", 0, mac)
        settleAlive(f.socket, 3_000)
        f.h.session.removeMac(mac)
        testScheduler.advanceTimeBy(5_000)
        testScheduler.runCurrent()
        assertNull(f.h.env.agentTabs.screen("t1", mac))
        assertTrue(f.h.env.agentTabs.tabs("api", mac).isEmpty())
    }
}
