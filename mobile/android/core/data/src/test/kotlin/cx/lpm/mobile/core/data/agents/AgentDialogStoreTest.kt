package cx.lpm.mobile.core.data.agents

import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AgentDialogStoreTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun FakeSocket.dialog(id: String? = "d-1", key: String = KEY) = receive(
        """{"t":"agentDialog","project":"api","terminalId":"t-1","key":"$key","ts":42,""" +
            """"dialog":${if (id == null) "null" else dialogJson(id)}}"""
    )

    private fun dialogJson(id: String) =
        """{"id":"$id","question":"Run it?","details":[],"options":[""" +
            """{"key":"1","label":"Yes","description":"","typed":false},""" +
            """{"key":"2","label":"Type something.","description":"","typed":true}]}"""

    private fun TestScope.ready(): Pair<FakeSocket, AgentDialogStore> {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf("agentDialog", "answerAgent"))
        return socket to h.session.store()
    }

    @Test
    fun `follow asks again until the Mac reads a dialog`() = runTest {
        val (socket, store) = ready()
        backgroundScope.launch { store.follow("api", "t-1", KEY) }
        settle()
        assertEquals(1, socket.sentOf("agentDialog").size)
        val frame = socket.sentOf("agentDialog").single()
        assertEquals("api", frame.string("project"))
        assertEquals("t-1", frame.string("terminalId"))

        socket.dialog(id = null)
        settleAlive(socket, 1_000)
        assertEquals(2, socket.sentOf("agentDialog").size)
        settleAlive(socket, 2_000)
        assertEquals(3, socket.sentOf("agentDialog").size)

        socket.dialog()
        settleAlive(socket, 30_000)
        assertEquals("a dialog on screen ends the asking", 3, socket.sentOf("agentDialog").size)
        assertEquals("d-1", store.state.value.read("t-1", KEY)?.dialog?.id)
        assertNull("another report's dialog isn't this row's", store.state.value.read("t-1", "x"))
    }

    @Test
    fun `follow gives up after five tries`() = runTest {
        val (socket, store) = ready()
        backgroundScope.launch { store.follow("api", "t-1", KEY) }
        settleAlive(socket, 60_000)
        assertEquals(5, socket.sentOf("agentDialog").size)
    }

    @Test
    fun `a Mac without the feature is never asked`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<AgentDialogStore>()
        assertFalse(store.available)
        backgroundScope.launch { store.follow("api", "t-1", KEY) }
        settle()
        assertTrue(socket.sentOf("agentDialog").isEmpty())
    }

    @Test
    fun `a pick names its report and dialog, then waits for the agent to move on`() = runTest {
        val (socket, store) = ready()
        socket.dialog()
        settle()
        val read = store.state.value.read("t-1", KEY)!!
        store.pick(read.dialog!!.options[0], read)
        store.pick(read.dialog!!.options[1], read)

        val frame = socket.sentOf("answerAgent").single()
        assertEquals("pick", frame.string("action"))
        assertEquals("1", frame.string("option"))
        assertEquals("d-1", frame.string("dialog"))
        assertEquals(KEY, frame.string("key"))
        assertEquals(42L, frame.long("ts"))
        assertEquals(mapOf("t-1" to "1"), store.state.value.picking)

        socket.receive("""{"t":"answerAgent","ok":true,"reqId":"${frame.string("reqId")}"}""")
        settle()
        assertEquals(emptyMap<String, String>(), store.state.value.picking)
        assertTrue(store.state.value.isAnswered(read))

        settleAlive(socket, 2_500)
        assertEquals("the dialog is read again", 1, socket.sentOf("agentDialog").size)
        socket.dialog(id = null)
        settleAlive(socket, 2_000)
        assertFalse(store.state.value.isAnswered(read))
        assertNull(store.state.value.errors["t-1"])
    }

    @Test
    fun `a dialog still up after the pick says the answer didn't get through`() = runTest {
        val (socket, store) = ready()
        socket.dialog()
        settle()
        val read = store.state.value.read("t-1", KEY)!!
        store.pick(read.dialog!!.options[0], read)
        val reqId = socket.sentOf("answerAgent").single().string("reqId")
        socket.receive("""{"t":"answerAgent","ok":true,"reqId":"$reqId"}""")
        settleAlive(socket, 2_500)
        socket.dialog()
        settleAlive(socket, 1_500)

        assertFalse(store.state.value.isAnswered(read))
        assertEquals(
            "The answer didn't reach the agent. Open the tab to check.",
            store.state.value.errors["t-1"]
        )
        socket.dialog(id = "d-2")
        settle()
        assertNull("a new question clears it", store.state.value.errors["t-1"])
    }

    @Test
    fun `a refused pick shows why and reads the dialog again`() = runTest {
        val (socket, store) = ready()
        socket.dialog()
        settle()
        val read = store.state.value.read("t-1", KEY)!!
        store.pick(read.dialog!!.options[0], read)
        val reqId = socket.sentOf("answerAgent").single().string("reqId")
        socket.receive(
            """{"t":"answerAgent","ok":false,"error":"This prompt was already answered.",""" +
                """"reqId":"$reqId"}"""
        )
        settle()
        assertEquals(emptyMap<String, String>(), store.state.value.picking)
        assertEquals("This prompt was already answered.", store.state.value.errors["t-1"])
        assertEquals(Haptic.Error, store.state.value.feedback?.haptic)
        assertFalse(store.state.value.isAnswered(read))
        assertEquals(1, socket.sentOf("agentDialog").size)
    }

    @Test
    fun `a pick the Mac never answers says it can't be reached`() = runTest {
        val (socket, store) = ready()
        socket.dialog()
        settle()
        val read = store.state.value.read("t-1", KEY)!!
        store.pick(AgentDialogOption("1", "Yes", "", typed = false), read)
        settleAlive(socket, 10_000)
        assertEquals(emptyMap<String, String>(), store.state.value.picking)
        assertEquals("Couldn't reach your Mac. Try again.", store.state.value.errors["t-1"])

        val reqId = socket.sentOf("answerAgent").single().string("reqId")!!
        assertFalse("a late reply is no longer this store's", store.applyAnswer(reqId, null))
    }

    @Test
    fun `replies to other answers leave the dialogs alone`() = runTest {
        val (socket, store) = ready()
        socket.receive("""{"t":"answerAgent","ok":false,"error":"Nope","reqId":"someone-else"}""")
        settle()
        assertEquals(AgentDialogState(), store.state.value)
    }

    private companion object {
        const val KEY = "claude_code_t-1"
    }
}
