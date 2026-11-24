package cx.lpm.mobile.core.data.conversation

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.ConversationPart
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationStoreTest {
    private class Fixture(val h: SessionHarness, val socket: FakeSocket) {
        val store: ConversationStore = h.session.store()
        val list: ConversationList get() = store.state.value.lists[TERM] ?: ConversationList()
        val ids: List<String> get() = list.items.map { it.id }

        fun push(items: String, reset: Boolean = false, more: Boolean = false) = receive(
            """{"t":"conversation","id":"$TERM","project":"api","ok":true,"reset":$reset,""" +
                """"more":$more,"items":[$items]}"""
        )

        fun receive(frame: String) {
            socket.receive(frame)
            h.scheduler.runCurrent()
        }

        fun loadEarlier() {
            store.loadEarlier(TERM, "api")
            h.scheduler.runCurrent()
        }

        fun loadDetail(item: ConversationItem) {
            store.loadDetail(TERM, "api", item)
            h.scheduler.runCurrent()
        }
    }

    private fun TestScope.ready(): Fixture {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf(LpmClient.AGENT_CONVERSATION_FEATURE))
        val fixture = Fixture(h, socket)
        fixture.receive("""{"t":"projects","projects":[{"name":"api","label":"api"}]}""")
        return fixture
    }

    private fun prompt(id: String) = """{"id":"$id","kind":"prompt","text":"$id"}"""

    private fun tool(id: String, state: String) =
        """{"id":"$id","kind":"tool","what":"run","verb":"Ran","state":"$state"}"""

    @Test
    fun `a watched conversation grows by what changed`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        assertEquals(1, f.socket.sentOf("conversationWatch").size)
        assertFalse(f.list.loaded)

        f.push("${prompt("a")},${tool("b", "running")}", reset = true, more = true)
        assertTrue(f.list.loaded)
        assertTrue(f.list.more)
        f.push("${tool("b", "done")},${prompt("c")}")
        assertEquals(listOf("a", "b", "c"), f.ids)
        assertEquals("Done", f.list.items[1].tool?.state?.name)
    }

    @Test
    fun `a new list keeps what was scrolled back to and drops another conversation`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.push("${prompt("a")},${prompt("b")},${prompt("c")}", reset = true)
        f.push("${prompt("b")},${prompt("c")},${prompt("d")}", reset = true, more = true)
        assertEquals(listOf("a", "b", "c", "d"), f.ids)
        assertFalse(f.list.more)

        f.push(prompt("z"), reset = true)
        assertEquals(listOf("z"), f.ids)
    }

    @Test
    fun `earlier entries go before the list they were asked for`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.push(prompt("c"), reset = true, more = true)
        f.loadEarlier()
        assertTrue(f.list.loadingEarlier)
        f.loadEarlier()
        val asked = f.socket.sentOf("conversationPage").single()
        assertEquals("c", asked.string("before"))
        f.receive(
            """{"t":"conversationPage","ok":true,"items":[${prompt("a")},${prompt("b")}],""" +
                """"more":false,"reqId":"${asked.string("reqId")}"}"""
        )
        assertEquals(listOf("a", "b", "c"), f.ids)
        assertFalse(f.list.more)
        assertFalse(f.list.loadingEarlier)
    }

    @Test
    fun `an earlier page for a list that moved on is dropped`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.push(prompt("c"), reset = true, more = true)
        f.loadEarlier()
        val asked = f.socket.sentOf("conversationPage").single()
        f.push(prompt("z"), reset = true)
        f.receive(
            """{"t":"conversationPage","ok":true,"items":[${prompt("b")}],"more":false,""" +
                """"reqId":"${asked.string("reqId")}"}"""
        )
        assertEquals(listOf("z"), f.ids)
        assertFalse(f.list.loadingEarlier)
    }

    @Test
    fun `a step is read once, and again once it ends`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.push(tool("b", "running"), reset = true)
        f.loadDetail(f.list.items.single())
        f.loadDetail(f.list.items.single())
        val asked = f.socket.sentOf("conversationDetail").single()
        f.receive(
            """{"t":"conversationDetail","ok":true,"parts":[{"style":"code","text":"ls"}],""" +
                """"reqId":"${asked.string("reqId")}"}"""
        )
        val key = ConversationStore.detailKey(TERM, f.list.items.single())
        assertEquals(
            ConversationDetail.Parts(
                listOf(ConversationPart("", ConversationPart.Style.Code, "ls"))
            ),
            f.store.state.value.details[key]
        )
        f.push(tool("b", "done"))
        f.loadDetail(f.list.items.single())
        assertEquals(2, f.socket.sentOf("conversationDetail").size)
    }

    @Test
    fun `a step the Mac never answers says so`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.push(tool("b", "done"), reset = true)
        f.loadDetail(f.list.items.single())
        settleAlive(f.socket, 20_000)
        val key = ConversationStore.detailKey(TERM, f.list.items.single())
        assertEquals(
            ConversationDetail.Failed("The Mac didn't answer in time."),
            f.store.state.value.details[key]
        )
    }

    @Test
    fun `a step asked for when the link drops says so`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.push(tool("b", "done"), reset = true)
        f.loadDetail(f.list.items.single())
        val key = ConversationStore.detailKey(TERM, f.list.items.single())
        f.store.onConnectionReset()
        f.h.scheduler.runCurrent()
        assertEquals(
            ConversationDetail.Failed("Lost the connection to the Mac."),
            f.store.state.value.details[key]
        )
    }

    @Test
    fun `a prompt sent from here shows until the transcript has it`() = runTest {
        val f = ready()
        f.h.terminals.openTerminalScreen(TERM, this, hooks())
        assertTrue(f.h.terminals.submit(TERM, "ignored: nothing watches"))
        assertEquals(emptyList<String>(), f.list.sending.map { it.text })

        f.store.watch(TERM, "api")
        f.push("", reset = true)
        assertTrue(f.h.terminals.submit(TERM, " hello "))
        assertEquals(listOf("hello"), f.list.sending.map { it.text })
        f.push(prompt("a"))
        assertEquals(emptyList<String>(), f.list.sending.map { it.text })
    }

    @Test
    fun `a prompt that never shows up lapses once the agent isn't working`() = runTest {
        val f = ready()
        f.h.terminals.openTerminalScreen(TERM, this, hooks())
        f.store.watch(TERM, "api")
        f.push("", reset = true)
        f.h.terminals.submit(TERM, "hello")
        settleAlive(f.socket, 11_000)
        assertEquals(1, f.list.sending.size)
        settleAlive(f.socket, 2_000)
        assertEquals(0, f.list.sending.size)
    }

    @Test
    fun `the last screen to go ends the watch`() = runTest {
        val f = ready()
        f.store.watch(TERM, "api")
        f.store.watch(TERM, "api")
        f.store.unwatch(TERM)
        assertEquals(0, f.socket.sentOf("conversationUnwatch").size)
        f.store.unwatch(TERM)
        assertEquals(1, f.socket.sentOf("conversationUnwatch").size)
    }

    private fun hooks() = TerminalHooks(
        seed = { _, _, _, _ -> },
        output = {},
        submit = {},
        capture = { _, done -> done("") }
    )

    private companion object {
        const val TERM = "t-1"
    }
}
