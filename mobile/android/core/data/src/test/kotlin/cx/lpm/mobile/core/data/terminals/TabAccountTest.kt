package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.ClaudeAccountInfo
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TabAccountTest {
    private val work = ClaudeAccountInfo(
        id = "work",
        label = "Work",
        name = "Work",
        signedIn = true,
        email = "you@work.example",
        plan = "max",
        confirmed = true
    )

    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun FakeSocket.terminals(vararg tabs: String) = receive(
        """{"t":"terminals","project":"storefront","terminals":[${tabs.joinToString(",")}]}"""
    )

    private fun claudeTab(id: String, account: String = "default", extra: String = "") =
        """{"id":"$id","label":"Claude","project":"storefront","canSwitchAccount":true,""" +
            """"claudeAccount":"$account"$extra}"""

    @Test
    fun `a switch goes to the Mac and covers the tab, then follows the move it lists`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.TAB_ACCOUNT_FEATURE))
        socket.terminals(claudeTab("t1"))
        settle()
        val store = h.terminals
        val tab = store.state.value.terminals.getValue("storefront").single()

        assertTrue(store.switchTerminalAccount(tab, work))
        assertEquals(
            "work",
            socket.sentOf("switchTerminalAccount").single()["account"]?.jsonPrimitive?.content
        )
        assertEquals("Work", store.state.value.accountMove(tab))

        socket.terminals(claudeTab("t2", "work", ""","switchingTo":"Work","switchedFrom":"t1""""))
        settle()
        val moved = store.state.value.movedTab(tab)
        assertEquals("t2", moved?.id)
        assertEquals("Work", store.state.value.accountMove(moved!!))

        settle(11_000)
        assertNull(store.state.value.accountMoves["t1"])
    }

    @Test
    fun `the account a tab already runs as sends nothing`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.TAB_ACCOUNT_FEATURE))
        socket.terminals(claudeTab("t1", "work"))
        settle()
        val tab = h.terminals.state.value.terminals.getValue("storefront").single()
        assertFalse(h.terminals.switchTerminalAccount(tab, work))
        assertEquals(0, socket.sentOf("switchTerminalAccount").size)
    }

    @Test
    fun `a Mac that can't move tabs is sent nothing`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        socket.terminals(claudeTab("t1"))
        settle()
        val tab = h.terminals.state.value.terminals.getValue("storefront").single()
        assertFalse(h.terminals.switchTerminalAccount(tab, work))
        assertEquals(0, socket.sentOf("switchTerminalAccount").size)
    }
}
