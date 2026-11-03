package cx.lpm.mobile.feature.terminal.composer

import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.snapshots.Snapshot
import cx.lpm.mobile.core.data.commands.LpmCommandsStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.services.ServiceLogsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.terminal.history.HistoryStore
import java.nio.file.Files
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ComposerLpmCommandsTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val submitted = mutableListOf<String>()

    private class Setup(val socket: FakeSocket, val vm: ComposerViewModel)

    private fun TestScope.setup(features: List<String> = listOf("lpmCommands")): Setup {
        val media = FakeMedia(Files.createTempDirectory("composer").toFile())
        val io = StandardTestDispatcher(testScheduler)
        val t = TestSession(
            this,
            stores = setOf(
                SessionStore.Factory {
                    ComposerSessions(it, media, io, "phone") { testScheduler.currentTime }
                },
                SessionStore.Factory(::HistoryStore),
                SessionStore.Factory(::ServiceLogsStore),
                SessionStore.Factory(::GitStore),
                SessionStore.Factory(::LpmCommandsStore)
            )
        )
        val socket = t.connectReady(features = features)
        t.store<TerminalsStore>().openTerminalScreen(
            "t1",
            this,
            TerminalHooks({ _, _, _, _ -> }, {}, { submitted += it }, { _, done -> done("") })
        )
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[""" +
                """{"id":"t1","label":"Claude","project":"storefront","cli":"claude"}]}"""
        )
        socket.receive(
            """{"t":"slash","id":"t1","commands":[""" +
                """{"name":"fix-ticket","description":"Fix","argumentHint":"<ticket>",""" +
                """"source":"lpm",""" +
                """"folder":"Bugs","scope":"project"},""" +
                """{"name":"explain","description":"","argumentHint":"","source":"lpm",""" +
                """"folder":null,"scope":"global"},""" +
                """{"name":"review","description":"","argumentHint":"","source":"builtin"}]}"""
        )
        val vm = ComposerViewModel(
            ComposerTarget("t1", "storefront", "Claude", SessionKey.Live),
            t.sessions
        )
        backgroundScope.launch { vm.uiState.collect {} }
        testScheduler.runCurrent()
        return Setup(socket, vm)
    }

    private fun TestScope.type(vm: ComposerViewModel, text: String) {
        vm.input.setTextAndPlaceCursorAtEnd(text)
        Snapshot.sendApplyNotifications()
        testScheduler.runCurrent()
    }

    private fun TestScope.expanded(s: Setup, text: String, missing: String = "") {
        val reqId = s.socket.sentOf("lpmCommandExpand").last().string("reqId")
        s.socket.receive(
            """{"t":"lpmCommandExpand","project":"storefront","ok":true,"reqId":"$reqId",""" +
                """"text":"$text","missing":[$missing]}"""
        )
        testScheduler.runCurrent()
    }

    @Test
    fun `the menu groups lpm commands and ends with Manage commands`() = runTest {
        val s = setup()
        type(s.vm, "/")
        val state = s.vm.uiState.value
        assertTrue(state.lpmCommands)
        assertEquals("Claude Code", state.agentLabel)
        assertEquals(listOf("fix-ticket", "explain", "review"), state.slashMatches.map { it.name })
        type(s.vm, "/bu")
        assertEquals(listOf("fix-ticket"), s.vm.uiState.value.slashMatches.map { it.name })
    }

    @Test
    fun `a Mac without lpm commands offers neither Manage nor Save as command`() = runTest {
        val s = setup(features = emptyList())
        type(s.vm, "/")
        assertFalse(s.vm.uiState.value.lpmCommands)
    }

    @Test
    fun `picking a command that asks for nothing runs it at once`() = runTest {
        val s = setup()
        type(s.vm, "/ex")
        s.vm.pickSlash(s.vm.uiState.value.slashMatches.first { it.name == "explain" })
        testScheduler.runCurrent()
        val ask = s.socket.sentOf("lpmCommandExpand").single()
        assertEquals("explain", ask.string("name"))
        assertEquals("", ask.string("args"))
        expanded(s, "Explain it")
        assertEquals(listOf("Explain it"), submitted)
        assertEquals("", s.vm.input.text.toString())
    }

    @Test
    fun `picking a command that asks for values leaves it for them`() = runTest {
        val s = setup()
        type(s.vm, "/fix")
        s.vm.pickSlash(s.vm.uiState.value.slashMatches.single())
        testScheduler.runCurrent()
        assertEquals("/fix-ticket ", s.vm.input.text.toString())
        assertEquals("<ticket>", s.vm.uiState.value.slashArgumentHint)
        assertTrue(s.socket.sentOf("lpmCommandExpand").isEmpty())
    }

    @Test
    fun `picked mid-message, its prompt takes the fragment's place`() = runTest {
        val s = setup()
        type(s.vm, "first this, then /ex")
        s.vm.pickSlash(s.vm.uiState.value.slashMatches.single())
        testScheduler.runCurrent()
        expanded(s, "Explain it")
        assertEquals("first this, then Explain it", s.vm.input.text.toString())
        assertTrue(submitted.isEmpty())
    }

    @Test
    fun `sending a command with its values sends the filled prompt`() = runTest {
        val s = setup()
        type(s.vm, "/FIX-TICKET LPM-12 now")
        assertTrue(s.vm.send())
        testScheduler.runCurrent()
        val ask = s.socket.sentOf("lpmCommandExpand").single()
        assertEquals("fix-ticket", ask.string("name"))
        assertEquals("LPM-12 now", ask.string("args"))
        expanded(s, "Fix LPM-12 now on main")
        assertEquals(listOf("Fix LPM-12 now on main"), submitted)
        val recorded = s.socket.sentOf("historyAdd").single().string("text")
        assertEquals("Fix LPM-12 now on main", recorded)
    }

    @Test
    fun `a value still missing puts the prompt in the field to finish`() = runTest {
        val s = setup()
        type(s.vm, "/fix-ticket")
        s.vm.send()
        testScheduler.runCurrent()
        expanded(s, "Fix {{ticket}} on main", missing = "\"ticket\"")
        assertTrue(submitted.isEmpty())
        assertEquals("Fix {{ticket}} on main", s.vm.input.text.toString())
        assertEquals(CommandNotice.FillIn("{{ticket}}"), s.vm.uiState.value.commandNotice)
        s.vm.dismissCommandNotice()
        testScheduler.runCurrent()
        assertEquals(null, s.vm.uiState.value.commandNotice)
    }

    @Test
    fun `a refused run says why and keeps the message`() = runTest {
        val s = setup()
        type(s.vm, "/explain this")
        s.vm.send()
        testScheduler.runCurrent()
        val reqId = s.socket.sentOf("lpmCommandExpand").single().string("reqId")
        s.socket.receive(
            """{"t":"lpmCommandExpand","ok":false,"reqId":"$reqId",""" +
                """"error":"/explain isn't one of your commands."}"""
        )
        testScheduler.runCurrent()
        assertEquals(
            CommandNotice.Failed("/explain isn't one of your commands."),
            s.vm.uiState.value.commandNotice
        )
        assertEquals("/explain this", s.vm.input.text.toString())
    }

    @Test
    fun `an agent command still goes as typed`() = runTest {
        val s = setup()
        type(s.vm, "/review now")
        assertTrue(s.vm.send())
        testScheduler.runCurrent()
        assertTrue(s.socket.sentOf("lpmCommandExpand").isEmpty())
        assertEquals(listOf("/review now"), submitted)
    }

    @Test
    fun `after a change the menu asks for its rows again when it opens`() = runTest {
        val s = setup()
        val before = s.socket.sentOf("slash").size
        s.socket.receive("""{"t":"lpmCommandsChanged","project":""}""")
        testScheduler.runCurrent()
        assertEquals(before, s.socket.sentOf("slash").size)
        type(s.vm, "/")
        assertEquals(before + 1, s.socket.sentOf("slash").size)
        type(s.vm, "")
        type(s.vm, "/")
        assertEquals(before + 1, s.socket.sentOf("slash").size)
    }
}
