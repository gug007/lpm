package cx.lpm.mobile.feature.activity

import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

private val Stores = setOf(
    SessionStore.Factory(::AutomationsStore),
    SessionStore.Factory(::MachineImporter)
)

@OptIn(ExperimentalCoroutinesApi::class)
class ActivityViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.demo(): Pair<TestSession, ActivityViewModel> {
        val t = TestSession(this, Stores)
        t.enterDemo()
        t.settle()
        val vm = ActivityViewModel(t.session, t.prefs, t.clock)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return t to vm
    }

    private fun TestSession.settle(millis: Long = 1_000) {
        scheduler.advanceTimeBy(millis)
        scheduler.runCurrent()
    }

    @Test
    fun `an agent on one of the Mac's machines opens there in a visit`() = runTest {
        val t = TestSession(this, Stores)
        val socket = t.connectReady()
        socket.receive("""{"t":"projects","projects":[{"name":"web"}]}""")
        socket.receive(
            """{"t":"machines","machines":[{"slug":"box","name":"Build Box","platform":"linux",""" +
                """"state":"update","relay":true,"projects":[{"name":"api","statusEntries":[""" +
                """{"key":"claude_code_1","value":"Waiting","paneID":"t1"}]}]}]}"""
        )
        t.settle()
        val vm = ActivityViewModel(t.session, t.prefs, t.clock)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()

        val row = vm.uiState.value.activity.rows.single()
        assertEquals("box", row.project.machine)
        assertEquals("Build Box", row.project.machineName)
        assertNull(activityDestination(row))
        assertEquals(TerminalKey("api", "t1", SessionKey.Visit("box")), vm.visit(row))
        assertEquals(SessionKey.Visit("box"), t.session.visitSession.value?.key)
    }

    /** An agent that finished on storefront's first terminal, as the Mac would report it. */
    private fun TestSession.agentDone() = store<ProjectsStore>().updateProject("storefront") {
        it.withStatus(
            listOf(status("claude_code_1", "Done", pane = "storefront-1", at = 1)),
            it.seenEntries
        )
    }

    @Test
    fun `the demo Mac shows storefront's services and counts the quiet projects`() = runTest {
        val (_, vm) = demo()
        val state = vm.uiState.value
        assertTrue(state.activity.rows.isEmpty())
        val storefront = state.activity.services.single()
        assertEquals("storefront", storefront.id)
        assertEquals(listOf("web", "api"), storefront.running)
        assertEquals(listOf("worker"), storefront.declared)
        assertEquals(4, state.activity.quietProjectCount)
        assertNull(state.subtitle)
        assertNull(state.notConnectedTo)
        assertFalse(state.grouped)
    }

    @Test
    fun `grouping by project is remembered under the iOS key`() = runTest {
        val (t, vm) = demo()
        vm.toggleGrouped()
        t.settle()
        assertTrue(vm.uiState.value.grouped)
        assertEquals(true, t.prefs.bool(PreferenceKeys.ACTIVITY_GROUP_BY_PROJECT))
        vm.toggleGrouped()
        t.settle()
        assertFalse(vm.uiState.value.grouped)
    }

    @Test
    fun `clearing a finished agent drops its row at once`() = runTest {
        val (t, vm) = demo()
        t.agentDone()
        t.settle()
        val row = vm.uiState.value.activity.rows.single()
        assertTrue(row.dismissable)

        vm.dismiss(row)
        assertTrue(vm.uiState.value.activity.rows.isEmpty())
        t.settle()
        assertTrue(vm.uiState.value.activity.rows.isEmpty())
    }

    @Test
    fun `loading asks for the tabs behind the agent rows`() = runTest {
        val (t, vm) = demo()
        t.agentDone()
        vm.load()
        t.settle()
        assertTrue("storefront" in t.store<TerminalsStore>().state.value.terminals)
        assertFalse("api-gateway" in t.store<TerminalsStore>().state.value.terminals)
    }

    @Test
    fun `a service chip spins until the Mac confirms the stop`() = runTest {
        val (t, vm) = demo()
        val web = vm.uiState.value.activity.services.single().chips.first { it.name == "web" }
        vm.runChip("storefront", web)
        t.scheduler.runCurrent()
        assertEquals(setOf("web"), vm.uiState.value.pendingServices["storefront"])

        t.settle(5_000)
        val state = vm.uiState.value
        assertNull(state.pendingServices["storefront"])
        assertEquals(listOf("api"), state.activity.services.single().running)
    }

    @Test
    fun `stopping everything spins the card until the project stops`() = runTest {
        val (t, vm) = demo()
        vm.stop("storefront")
        t.scheduler.runCurrent()
        assertEquals(setOf("storefront"), vm.uiState.value.stopping)

        t.settle(5_000)
        assertTrue(vm.uiState.value.stopping.isEmpty())
        assertTrue(vm.uiState.value.activity.services.isEmpty())
        assertEquals(5, vm.uiState.value.activity.quietProjectCount)
    }
}
