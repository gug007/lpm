package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TabMenuTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun FakeSocket.terminals(vararg tabs: String) {
        val list = tabs.joinToString(",") {
            val (id, flags) = it.split(":").let { p -> p[0] to p.getOrElse(1) { "" } }
            """{"id":"$id","label":"$id","project":"storefront","pinned":${"p" in flags},""" +
                """"canFork":${"f" in flags},"canForkCopy":${"f" in flags},"canTitle":${"f" in flags}}"""
        }
        receive("""{"t":"terminals","project":"storefront","terminals":[$list]}""")
    }

    private fun TerminalsStore.ids() = state.value.terminals["storefront"].orEmpty().map { it.id }

    private fun TerminalsStore.tab(id: String) =
        state.value.terminals["storefront"].orEmpty().first { it.id == id }

    @Test
    fun `undo puts a closed tab back in its place, and the Mac never hears of it`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        socket.terminals("t1", "t2", "t3")
        settle()
        val store = h.terminals
        store.closeTerminal("storefront", "t2")
        assertEquals(listOf("t1", "t3"), store.ids())
        assertEquals("t2", store.state.value.pendingTabClose?.tab?.id)

        store.undoTabClose()
        assertEquals(listOf("t1", "t2", "t3"), store.ids())
        assertNull(store.state.value.pendingTabClose)
        settle(UNDO_CLOSE_MS * 2)
        assertEquals(0, socket.sentOf("closeTerminal").size)
    }

    @Test
    fun `a second close sends the first on at once`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        socket.terminals("t1", "t2", "t3")
        settle()
        val store = h.terminals
        store.closeTerminal("storefront", "t2")
        store.closeTerminal("storefront", "t3")
        assertEquals(1, socket.sentOf("closeTerminal").size)
        assertEquals("t3", store.state.value.pendingTabClose?.tab?.id)
        assertEquals(listOf("t1"), store.ids())
    }

    @Test
    fun `leaving the screen sends a close still waiting on its undo`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        socket.terminals("t1", "t2")
        settle()
        h.terminals.closeTerminal("storefront", "t2")
        h.session.setInForeground(false)
        assertEquals(1, socket.sentOf("closeTerminal").size)
        assertNull(h.terminals.state.value.pendingTabClose)
    }

    @Test
    fun `close other tabs keeps pinned ones and goes out as one request`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.TAB_MENU_FEATURE))
        socket.terminals("t1", "t2:p", "t3", "t4")
        settle()
        val store = h.terminals
        store.closeOtherTerminals(store.tab("t1"))
        assertEquals(listOf("t1", "t2"), store.ids())
        assertEquals(1, socket.sentOf("closeOtherTerminals").size)
        assertEquals(0, socket.sentOf("closeTerminal").size)
    }

    @Test
    fun `a close that waits leaves the tab listed, and can be taken back`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.CLOSE_WHEN_DONE_FEATURE))
        socket.terminals("t1", "t2")
        settle()
        val store = h.terminals
        store.closeTerminalWhenDone(store.tab("t2"))
        assertEquals(listOf("t1", "t2"), store.ids())
        assertNull(store.state.value.pendingTabClose)
        assertEquals(true, socket.sentOf("closeTerminal").single().toString().contains("whenDone"))

        store.keepTerminalOpen(store.tab("t2"))
        assertEquals(1, socket.sentOf("keepTerminal").size)
    }

    @Test
    fun `close other tabs when done hides only the idle ones`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(
            listOf(LpmClient.TAB_MENU_FEATURE, LpmClient.CLOSE_WHEN_DONE_FEATURE)
        )
        socket.terminals("t1", "t2:p", "t3", "t4")
        settle()
        val store = h.terminals
        store.closeOtherTerminals(store.tab("t1"), busy = setOf("t4"))
        assertEquals(listOf("t1", "t2", "t4"), store.ids())
        val sent = socket.sentOf("closeOtherTerminals").single().toString()
        assertEquals(true, sent.contains("whenDone"))
    }

    @Test
    fun `a Mac that cannot wait is never asked to`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.TAB_MENU_FEATURE))
        socket.terminals("t1", "t2")
        settle()
        val store = h.terminals
        assertEquals(false, store.canCloseWhenDone)
        store.closeTerminalWhenDone(store.tab("t2"))
        store.closeOtherTerminals(store.tab("t1"), busy = emptySet())
        store.keepTerminalOpen(store.tab("t2"))
        assertEquals(listOf("t1", "t2"), store.ids())
        assertEquals(0, socket.sentOf("closeTerminal").size)
        assertEquals(0, socket.sentOf("closeOtherTerminals").size)
        assertEquals(0, socket.sentOf("keepTerminal").size)
    }

    @Test
    fun `the tab menu needs a Mac that takes it, and a tab that offers it`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        socket.terminals("t1:f", "t2")
        settle()
        val store = h.terminals
        assertEquals(false, store.canUseTabMenu)
        store.forkTerminal(store.tab("t1"))
        store.closeOtherTerminals(store.tab("t1"))
        assertEquals(0, socket.sentOf("forkTerminal").size)
        assertEquals(0, socket.sentOf("closeOtherTerminals").size)
    }

    @Test
    fun `fork, fork into copy and the conversation title go to the Mac`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.TAB_MENU_FEATURE))
        socket.terminals("t1:f", "t2")
        settle()
        val store = h.terminals
        store.forkTerminal(store.tab("t2"))
        assertEquals(0, socket.sentOf("forkTerminal").size)
        store.forkTerminal(store.tab("t1"))
        store.forkTerminalIntoCopy(store.tab("t1"))
        store.useConversationTitle(store.tab("t1"))
        assertEquals(1, socket.sentOf("forkTerminal").size)
        assertEquals(1, socket.sentOf("forkTerminalCopy").size)
        assertEquals(1, socket.sentOf("titleTerminal").size)
        assertEquals(true, "storefront" in store.state.value.creatingTerminals)
    }
}
