package cx.lpm.mobile.feature.projects.ci

import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.git.GitChecksStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.SessionKey
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
class GitChecksViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val options =
        """{"t":"agentOptions","agents":[{"id":"claude","label":"Claude Code","models":[]},""" +
            """{"id":"codex","label":"Codex","models":[]}]}"""

    private val agentActions =
        """[{"name":"claude","label":"Claude","primary":"last-used","children":[""" +
            """{"name":"claude:opus","type":"terminal","cmd":"claude --model opus"},""" +
            """{"name":"claude:review","label":"Review","type":"terminal","cmd":"claude",""" +
            """"inputs":[{"key":"branch","label":"Branch"}]}]},""" +
            """{"name":"codex","label":"Codex","type":"terminal","cmd":"codex","confirm":true},""" +
            """{"name":"fix-tests","label":"Fix tests","type":"terminal",""" +
            """"cmd":"claude \"Fix the failing tests\""},""" +
            """{"name":"notes","label":"Notes","type":"terminal","cmd":"claude",""" +
            """"prompt":"Write the release notes"}]"""

    private val failing =
        """{"t":"gitChecks","project":"storefront","ok":true,"branch":"main","pr":null,""" +
            """"commit":{"sha":"9e7d031b4c2a","title":"Checkout",""" +
            """"url":"https://github.com/o/r/commit/9e7d031b",""" +
            """"checks":[{"name":"test","workflow":"CI","state":"fail",""" +
            """"url":"https://github.com/o/r/actions/runs/7/job/1"}]},""" +
            """"fixPrompt":"CI checks are failing on main"}"""

    private fun TestScope.connected(actions: String = "[]"): Pair<TestSession, FakeSocket> {
        val t = TestSession(
            this,
            setOf(
                SessionStore.Factory(::AgentLaunchStore),
                SessionStore.Factory(::ActionsStore),
                SessionStore.Factory(::GitChecksStore),
                SessionStore.Factory(::GitStore)
            )
        )
        val socket = t.connectReady(
            features = listOf(
                LpmClient.AGENT_LAUNCH_FEATURE,
                LpmClient.ACTION_PROMPT_FEATURE,
                LpmClient.GIT_CHECKS_FEATURE
            )
        )
        socket.receive(
            """{"t":"projects","projects":[{"name":"storefront","running":true,"actions":$actions}]}"""
        )
        socket.receive(failing)
        testScheduler.runCurrent()
        return t to socket
    }

    private fun TestScope.subscribed(t: TestSession, socket: FakeSocket): GitChecksViewModel {
        val vm =
            GitChecksViewModel("storefront", SessionKey.Live, t.sessions, ActionMemory(t.prefs))
        backgroundScope.launch { vm.uiState.collect() }
        vm.loadAgents()
        testScheduler.runCurrent()
        socket.receive(options)
        testScheduler.runCurrent()
        return vm
    }

    private fun GitChecksViewModel.option(id: String) =
        uiState.value.fixTabs!!.flatMap { it.options }.first { it.id == id }

    @Test
    fun `a project without agent actions is fixed by any agent the Mac starts`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t, socket)
        assertEquals(listOf("claude", "codex"), vm.uiState.value.fixTabs?.map { it.id })

        assertTrue(vm.fix(vm.option("codex")) {})
        testScheduler.runCurrent()
        val sent = socket.sentOf("newTerminal").single()
        assertEquals(JsonPrimitive("codex"), sent["agent"])
        assertEquals(JsonPrimitive("CI checks are failing on main"), sent["prompt"])
    }

    @Test
    fun `an agent action runs with the failing checks, remembered by its group`() = runTest {
        // Fix tests and Notes start on tasks of their own, so they aren't offered.
        val (t, socket) = connected(agentActions)
        val vm = subscribed(t, socket)
        val tabs = vm.uiState.value.fixTabs!!
        assertEquals(listOf("claude", "codex"), tabs.map { it.id })
        assertEquals("claude:opus", tabs[0].primary?.id)

        assertTrue(vm.fix(vm.option("claude:opus")) {})
        testScheduler.runCurrent()
        val sent = socket.sentOf("runAction").single()
        assertEquals(JsonPrimitive("claude:opus"), sent["action"])
        assertEquals(JsonPrimitive(true), sent["confirmed"])
        assertEquals(JsonPrimitive("CI checks are failing on main"), sent["prompt"])
        assertEquals(
            """{"storefront/claude":"opus"}""",
            t.prefs.string(PreferenceKeys.ACTION_PRIMARY_LAST_USED)
        )
    }

    @Test
    fun `an action asks for its inputs or confirmation before it runs`() = runTest {
        val (t, socket) = connected(agentActions)
        val vm = subscribed(t, socket)

        assertFalse(vm.fix(vm.option("claude:review")) {})
        testScheduler.runCurrent()
        assertTrue(vm.uiState.value.step is ActionRunStep.Inputs)
        assertTrue(vm.submitInputs(mapOf("branch" to "main")) {})
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.step)
        val review = socket.sentOf("runAction").single()
        assertEquals(JsonPrimitive("main"), (review["inputValues"] as JsonObject)["branch"])

        assertFalse(vm.fix(vm.option("codex")) {})
        testScheduler.runCurrent()
        vm.dismissStep(vm.uiState.value.step!!)
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.step)
        assertEquals(1, socket.sentOf("runAction").size)
    }
}
