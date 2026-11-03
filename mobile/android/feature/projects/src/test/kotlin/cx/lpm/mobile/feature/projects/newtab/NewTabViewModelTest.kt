package cx.lpm.mobile.feature.projects.newtab

import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.NewTabPick
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.projects.ActionRunStep
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NewTabViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val options =
        """{"t":"agentOptions","agents":[""" +
            """{"id":"claude","label":"Claude Code","models":[""" +
            """{"value":"","label":"Default","efforts":[{"value":"","label":"Default"},""" +
            """{"value":"high","label":"High"}]},""" +
            """{"value":"opus","label":"Opus","efforts":[{"value":"","label":"Default"},""" +
            """{"value":"high","label":"High"}]}]},""" +
            """{"id":"codex","label":"Codex","models":[]},""" +
            """{"id":"gemini","label":"Gemini","models":[]}]}"""

    private val agentActions =
        """[{"name":"test","label":"Test","type":"command","cmd":"npm test"},""" +
            """{"name":"claude","label":"Claude","primary":"last-used","children":[""" +
            """{"name":"claude:opus","type":"terminal","cmd":"claude --model opus"},""" +
            """{"name":"claude:review","label":"Review","type":"terminal","cmd":"claude",""" +
            """"inputs":[{"key":"branch","label":"Branch"}],"confirm":true}]},""" +
            """{"name":"codex","label":"Codex","type":"terminal","cmd":"codex","confirm":true}]"""

    private fun TestScope.connected(
        features: List<String> = listOf(
            LpmClient.AGENT_LAUNCH_FEATURE,
            LpmClient.AGENT_SESSIONS_FEATURE,
            LpmClient.ACTION_PROMPT_FEATURE
        ),
        actions: String = "[]"
    ): Pair<TestSession, FakeSocket> {
        val t = TestSession(
            this,
            setOf(SessionStore.Factory(::AgentLaunchStore), SessionStore.Factory(::ActionsStore))
        )
        val socket = t.connectReady(features = features)
        socket.receive(
            """{"t":"projects","projects":[{"name":"storefront","running":true,"actions":$actions}]}"""
        )
        testScheduler.runCurrent()
        return t to socket
    }

    private fun TestScope.subscribed(t: TestSession): NewTabViewModel {
        val vm = NewTabViewModel(
            "storefront",
            SessionKey.Live,
            t.sessions,
            NewTabPickMemory(t.prefs),
            ActionMemory(t.prefs)
        )
        backgroundScope.launch { vm.uiState.collect() }
        vm.onAppear()
        testScheduler.runCurrent()
        return vm
    }

    private fun TestScope.ready(socket: FakeSocket) {
        socket.receive(options)
        testScheduler.runCurrent()
    }

    private fun NewTabViewModel.option(id: String) =
        uiState.value.tabs!!.flatMap { it.options }.first { it.id == id }

    private fun FakeSocket.runs(): List<JsonObject> = sentOf("runAction")

    @Test
    fun `the first time it's a terminal, and the agents come from the Mac`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        assertEquals(1, socket.sentOf("agentOptions").size)
        assertNull(vm.uiState.value.tabs)
        assertTrue(vm.uiState.value.terminalPicked)
        assertFalse(vm.uiState.value.awaitingOptions)
        assertTrue(vm.uiState.value.canResume)

        ready(socket)
        assertEquals(listOf("claude", "codex", "gemini"), vm.uiState.value.tabs?.map { it.id })
        assertTrue(vm.uiState.value.terminalPicked)
    }

    @Test
    fun `a bare agent and its model open a tab with them, remembered without the prompt`() =
        runTest {
            val (t, socket) = connected()
            val vm = subscribed(t)
            ready(socket)

            vm.pickOption(vm.option("claude"))
            vm.chooseModel("opus")
            vm.chooseEffort("high")
            vm.setPrompt("  Fix the failing test \n")
            testScheduler.runCurrent()
            val spawned = mutableListOf<TerminalInfo>()
            assertTrue(vm.open { spawned += it })
            testScheduler.runCurrent()

            val sent = socket.sentOf("newTerminal").single()
            assertEquals(JsonPrimitive("claude"), sent["agent"])
            assertEquals(JsonPrimitive("opus"), sent["model"])
            assertEquals(JsonPrimitive("high"), sent["effort"])
            assertEquals(JsonPrimitive("Fix the failing test"), sent["prompt"])
            assertEquals(
                """{"agent":"claude","model":"opus","effort":"high"}""",
                t.prefs.string(PreferenceKeys.NEW_TAB_LAST_PICK)
            )
            assertEquals("claude", t.prefs.string(PreferenceKeys.NEW_TAB_LAST_OPTION))
            socket.receive(
                """{"t":"terminals","project":"storefront","terminals":[{"id":"t9",""" +
                    """"project":"storefront"}]}"""
            )
            testScheduler.runCurrent()
            assertEquals(listOf("t9"), spawned.map { it.id })
        }

    @Test
    fun `a remembered agent waits for the Mac, then falls back to what it still offers`() =
        runTest {
            val (t, socket) = connected()
            NewTabPickMemory(t.prefs).save(NewTabPick("claude", "sonnet", "max"))
            val vm = subscribed(t)
            assertTrue(vm.uiState.value.awaitingOptions)
            assertFalse(vm.uiState.value.terminalPicked)

            ready(socket)
            assertEquals("claude", vm.uiState.value.option?.id)
            assertEquals(NewTabPick("claude", "", ""), vm.uiState.value.pick)
            assertFalse(vm.uiState.value.awaitingOptions)
        }

    @Test
    fun `changing the model keeps the effort only when it's offered`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        ready(socket)
        vm.pickOption(vm.option("claude"))
        testScheduler.runCurrent()
        vm.chooseEffort("high")
        testScheduler.runCurrent()
        vm.chooseModel("opus")
        testScheduler.runCurrent()
        assertEquals(NewTabPick("claude", "opus", "high"), vm.uiState.value.pick)

        vm.pickTerminal()
        vm.setPrompt("ignored")
        testScheduler.runCurrent()
        vm.open {}
        testScheduler.runCurrent()
        val sent = socket.sentOf("newTerminal").single()
        assertNull(sent["agent"])
        assertNull(sent["prompt"])
    }

    @Test
    fun `the project's agent actions take the bare agents' place, groups kept whole`() = runTest {
        val (t, socket) = connected(actions = agentActions)
        val vm = subscribed(t)
        ready(socket)

        val tabs = vm.uiState.value.tabs!!
        assertEquals(listOf("claude", "codex"), tabs.map { it.id })
        assertEquals(listOf("claude:opus", "claude:review"), tabs[0].options.map { it.id })
        assertEquals("claude:opus", tabs[0].primary?.id)
    }

    @Test
    fun `an agent action runs with the task as its first prompt, remembered by its group`() =
        runTest {
            val (t, socket) = connected(actions = agentActions)
            val vm = subscribed(t)
            ready(socket)

            vm.pickOption(vm.option("claude:opus"))
            vm.setPrompt(" Fix checkout ")
            testScheduler.runCurrent()
            assertNull(vm.uiState.value.bareAgent)
            assertTrue(vm.open {})
            testScheduler.runCurrent()

            val sent = socket.runs().single()
            assertEquals(JsonPrimitive("claude:opus"), sent["action"])
            assertEquals(JsonPrimitive(true), sent["confirmed"])
            assertEquals(JsonPrimitive("Fix checkout"), sent["prompt"])
            assertEquals("claude:opus", t.prefs.string(PreferenceKeys.NEW_TAB_LAST_OPTION))
            assertEquals(
                """{"storefront/claude":"opus"}""",
                t.prefs.string(PreferenceKeys.ACTION_PRIMARY_LAST_USED)
            )
        }

    @Test
    fun `an action asks for its inputs, then confirmation, before it runs`() = runTest {
        val (t, socket) = connected(actions = agentActions)
        val vm = subscribed(t)
        ready(socket)

        vm.pickOption(vm.option("claude:review"))
        testScheduler.runCurrent()
        assertFalse(vm.open {})
        testScheduler.runCurrent()
        val inputs = vm.uiState.value.step as ActionRunStep.Inputs
        assertEquals("claude:review", inputs.action.name)

        assertFalse(vm.submitInputs(mapOf("branch" to "main")) {})
        testScheduler.runCurrent()
        assertTrue(vm.uiState.value.step is ActionRunStep.Confirm)
        assertTrue(socket.runs().isEmpty())

        vm.confirm {}
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.step)
        val sent = socket.runs().single()
        assertEquals(JsonPrimitive("main"), (sent["inputValues"] as JsonObject)["branch"])
    }

    @Test
    fun `a cancelled confirmation runs nothing`() = runTest {
        val (t, socket) = connected(actions = agentActions)
        val vm = subscribed(t)
        ready(socket)

        vm.pickOption(vm.option("codex"))
        testScheduler.runCurrent()
        assertFalse(vm.open {})
        testScheduler.runCurrent()
        vm.dismiss(vm.uiState.value.step!!)
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.step)
        assertTrue(socket.runs().isEmpty())
    }

    @Test
    fun `a Mac that can't take an action's prompt offers the bare agents`() = runTest {
        val (t, socket) = connected(
            features = listOf(LpmClient.AGENT_LAUNCH_FEATURE),
            actions = agentActions
        )
        val vm = subscribed(t)
        ready(socket)
        assertEquals(listOf("claude", "codex", "gemini"), vm.uiState.value.tabs?.map { it.id })
        assertNull(vm.uiState.value.tabs!!.first().primary?.action)
    }

    @Test
    fun `an SSH project or an older Mac offers no past sessions`() = runTest {
        val (t, _) = connected(features = listOf(LpmClient.AGENT_LAUNCH_FEATURE))
        assertFalse(subscribed(t).uiState.value.canResume)
    }
}
