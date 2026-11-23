package cx.lpm.mobile.feature.terminal

import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.model.AgentPause
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.web.TerminalTheme
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TerminalViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val key = TerminalKey("storefront", "t1")

    private fun TestScope.session() =
        TestSession(this, stores = setOf(SessionStore.Factory(::GitStore)))

    private fun TestScope.ready(): Pair<TestSession, FakeSocket> {
        val t = session()
        val socket = t.connectReady()
        socket.receive("""{"t":"projects","projects":[{"name":"storefront","running":true}]}""")
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[{"id":"t1","label":"Terminal 1","project":"storefront"}]}"""
        )
        testScheduler.runCurrent()
        return t to socket
    }

    private fun TestScope.viewModel(t: TestSession): TerminalViewModel {
        val vm = TerminalViewModel(key, t.sessions, t.prefs, t.clock)
        backgroundScope.launch { vm.uiState.collect {} }
        testScheduler.runCurrent()
        return vm
    }

    @Test
    fun `the terminal shows once its list holds it`() = runTest {
        val (t, _) = ready()
        val state = viewModel(t).uiState.value
        assertEquals("Terminal 1", state.terminal?.label)
        assertEquals("storefront", state.project?.name)
        assertTrue(state.controlled)
        assertTrue(state.showsComposer)
        assertNull(state.statusLine)
    }

    @Test
    fun `a terminal missing from a loaded list is unavailable, not loading`() = runTest {
        val t = session()
        val socket = t.connectReady()
        val vm = viewModel(t)
        assertFalse(vm.uiState.value.listLoaded)
        vm.loadTerminals()
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("terminals").size)
        socket.receive("""{"t":"terminals","project":"storefront","terminals":[]}""")
        testScheduler.runCurrent()
        assertTrue(vm.uiState.value.listLoaded)
        assertNull(vm.uiState.value.terminal)
    }

    @Test
    fun `another surface's ownership hides the composer behind take control`() = runTest {
        val (t, socket) = ready()
        val vm = viewModel(t)
        socket.receive(
            """{"t":"control","id":"t1","owner":{"kind":"window","id":"w1","label":"Window"}}"""
        )
        testScheduler.runCurrent()
        assertFalse(vm.uiState.value.controlled)
        assertFalse(vm.uiState.value.showsComposer)
        assertEquals("Studio Mac", vm.uiState.value.ownerLabel)
        vm.claimControl()
        testScheduler.runCurrent()
        assertEquals("t1", socket.sentOf("claim").single()["id"]?.toString()?.trim('"'))
    }

    @Test
    fun `an exited terminal says how it ended and takes no more input`() = runTest {
        val (t, socket) = ready()
        val vm = viewModel(t)
        socket.receive("""{"t":"exit","id":"t1","code":2}""")
        testScheduler.runCurrent()
        assertEquals("Process exited with code 2", vm.uiState.value.ended?.message)
        assertFalse(vm.uiState.value.showsComposer)
    }

    @Test
    fun `the screen streams through its hooks and only the owner resizes`() = runTest {
        val (t, socket) = ready()
        val vm = viewModel(t)
        val output = mutableListOf<String>()
        val screen = Any()
        vm.openScreen(
            screen,
            TerminalHooks({ _, _, _, _ ->
            }, { output += it }, {}, { _, done -> done("") })
        )
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("sub").size)
        socket.receive("""{"t":"seed","id":"t1","cols":80,"rows":24,"data":""}""")
        socket.receive("""{"t":"o","id":"t1","d":"hi"}""")
        testScheduler.runCurrent()
        assertEquals(listOf("hi"), output)

        vm.input("ls\r")
        vm.resize(90, 30)
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("in").size)
        assertEquals(1, socket.sentOf("resize").size)
        socket.receive(
            """{"t":"control","id":"t1","owner":{"kind":"mobile","id":"other","label":"Pixel"}}"""
        )
        testScheduler.runCurrent()
        vm.resize(100, 40)
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("resize").size)

        vm.closeScreen(screen)
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("unsub").size)
    }

    private fun FakeSocket.status(vararg entries: String) =
        receive("""{"t":"status","project":"storefront","status":[${entries.joinToString(",")}]}""")

    private fun entry(
        value: String,
        pane: String,
        timestamp: Long,
        turnStart: Long = 0,
        endedAt: Long = 0
    ) = """{"key":"claude_code_$pane","value":"$value","timestamp":$timestamp,"paneID":"$pane",""" +
        """"turnStart":$turnStart,"endedAt":$endedAt}"""

    @Test
    fun `the title times the tab's agent as the sidebar reads it`() = runTest {
        val (t, socket) = ready()
        val vm = viewModel(t)
        val now = t.clock.millis()
        assertNull(vm.uiState.value.agent)

        socket.status(entry("Running", "t1", timestamp = now - 5_000, turnStart = now - 65_000))
        testScheduler.runCurrent()
        assertEquals(AgentTiming(AgentState.Working, now - 65_000, null), vm.uiState.value.agent)

        socket.status(
            entry(
                "Done",
                "t1",
                timestamp = now - 1_000,
                turnStart = now - 65_000,
                endedAt =
                    now - 2_000
            )
        )
        testScheduler.runCurrent()
        assertEquals(
            AgentTiming(AgentState.Done, now - 65_000, now - 2_000),
            vm.uiState.value.agent
        )

        socket.status(
            entry("Running", "t1", timestamp = now - 5_000, turnStart = now - 65_000)
                .replace("}", ""","pausedAt":${now - 3_000},"shells":["Run the test suite"]}""")
        )
        testScheduler.runCurrent()
        assertEquals(
            AgentTiming(
                AgentState.Working,
                now - 65_000,
                null,
                AgentPause(now - 3_000, listOf("Run the test suite"))
            ),
            vm.uiState.value.agent
        )

        socket.status(entry("Waiting", "t1", timestamp = now + 60_000))
        testScheduler.runCurrent()
        assertEquals(AgentTiming(AgentState.NeedsYou, now, null), vm.uiState.value.agent)

        socket.status(entry("Idle", "t1", timestamp = now), entry("Running", "t2", timestamp = now))
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.agent)
    }

    @Test
    fun `the title follows the project's changes while the screen shows`() = runTest {
        val (t, socket) = ready()
        val vm = viewModel(t)
        vm.appear()
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("gitWatch").size)
        assertTrue(vm.uiState.value.gitLoading)

        socket.receive(
            """{"t":"git","project":"storefront","ok":true,"isRepo":true,""" +
                """"files":[{"path":"a.ts","status":"modified"}],"linesAdded":12,"linesRemoved":3}"""
        )
        testScheduler.runCurrent()
        val git = vm.uiState.value.git
        assertEquals(12, git?.linesAdded)
        assertEquals(3, git?.linesRemoved)
        assertEquals(1, git?.files?.size)

        vm.disappear()
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("gitUnwatch").size)
    }

    @Test
    fun `the terminal follows the phone's font size and scheme`() = runTest {
        val (t, _) = ready()
        val vm = viewModel(t)
        assertEquals(12, vm.uiState.value.look.fontSize)
        assertEquals(TerminalTheme.ClaudeDark, vm.uiState.value.look.theme)
        t.prefs.setInt(PreferenceKeys.TERMINAL_FONT_SIZE, 40)
        t.prefs.setString(PreferenceKeys.TERMINAL_THEME, "nord")
        testScheduler.runCurrent()
        assertEquals(24, vm.uiState.value.look.fontSize)
        assertEquals(TerminalTheme.Nord, vm.uiState.value.look.theme)
    }

    @Test
    fun `a dropped link puts its status under the title`() = runTest {
        val (t, socket) = ready()
        val vm = viewModel(t)
        socket.fail()
        testScheduler.runCurrent()
        assertFalse(vm.uiState.value.connectionReady)
        assertTrue(vm.uiState.value.statusLine != null)
    }

    @Test
    fun `Demo Mode opens its scripted terminal`() = runTest {
        val t = session()
        t.enterDemo()
        testScheduler.advanceTimeBy(2_000)
        testScheduler.runCurrent()
        val vm =
            TerminalViewModel(
                TerminalKey("storefront", "demo-storefront-1"),
                t.sessions,
                t.prefs,
                t.clock
            )
        backgroundScope.launch { vm.uiState.collect {} }
        vm.loadTerminals()
        testScheduler.advanceTimeBy(2_000)
        testScheduler.runCurrent()
        assertEquals("Terminal 1", vm.uiState.value.terminal?.label)
        assertNull(vm.uiState.value.statusLine)
    }
}
