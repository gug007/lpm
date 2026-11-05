package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.projects.ScreenStores
import cx.lpm.mobile.feature.projects.demoSession
import cx.lpm.mobile.feature.projects.settle
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

class AgentAskViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.subscribed(t: TestSession): ProjectsViewModel {
        val vm = ProjectsViewModel(t.session, t.clock, t.device, t.feeds, t.tips)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    private fun ProjectsViewModel.storefront() = uiState.value.rows
        .filterIsInstance<ProjectsListRow.ProjectEntry>()
        .single { it.project.name == "storefront" }

    /** The demo's Claude tab runs its sample turn and ends waiting on a question. */
    private fun TestSession.claudeWaits() {
        session.client!!.subscribe(TERMINAL)
        settle(40_000)
    }

    @Test
    fun `the waiting Claude tab's question is answered from its row`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        t.claudeWaits()
        val row = vm.storefront().agents.single { it.terminalId == TERMINAL }
        assertEquals(AgentState.NeedsYou, row.state)
        assertEquals(
            "nothing is read until the row asks",
            emptyMap<String, AgentAsk>(),
            vm.storefront().asks
        )

        backgroundScope.launch { vm.followDialog("storefront", TERMINAL, row.id) }
        t.settle()
        val ask = vm.storefront().asks!!.getValue(row.id)
        val dialog = ask.read.dialog!!
        assertEquals("Update the cart badge to match the new checkout flow?", dialog.question)
        assertEquals(
            listOf("Yes, update it", "Not now", "Type something."),
            dialog.options.map { it.label }
        )
        assertFalse(ask.busy)

        vm.pickDialog(ask.read, dialog.options[1])
        t.settle(0)
        assertEquals("2", vm.storefront().asks!!.getValue(row.id).picking)
        t.settle(5_000)
        assertEquals(
            "the question is gone once answered",
            emptyMap<String, AgentAsk>(),
            vm.storefront().asks
        )
        assertEquals(null, vm.uiState.value.dialogFeedback)
    }

    @Test
    fun `a Mac that reads no dialogs is never asked`() = runTest {
        val t = TestSession(this, ScreenStores)
        val socket = t.connectReady()
        socket.receive(
            """{"t":"projects","projects":[{"name":"api","running":true,"statusEntries":[""" +
                """{"key":"claude_code_t1","value":"Waiting","priority":30,""" +
                """"timestamp":1792089000123,"paneID":"t1"}]}]}"""
        )
        val vm = subscribed(t)
        val api = vm.uiState.value.rows.filterIsInstance<ProjectsListRow.ProjectEntry>().single()
        assertEquals(AgentState.NeedsYou, api.agents.single().state)
        assertNull(api.asks)

        backgroundScope.launch { vm.followDialog("api", "t1", "claude_code_t1") }
        t.settle()
        assertTrue(socket.sentOf("agentDialog").isEmpty())
    }

    private companion object {
        const val TERMINAL = "demo-storefront-claude"
    }
}
