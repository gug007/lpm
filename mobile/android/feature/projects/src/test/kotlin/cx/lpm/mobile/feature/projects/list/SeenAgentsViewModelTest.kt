package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.data.terminals.UNDO_CLOSE_MS
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
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

class SeenAgentsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.subscribed(t: TestSession): ProjectsViewModel {
        val vm = ProjectsViewModel(t.session, t.clock, t.device)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    private fun ProjectsViewModel.entry(name: String) = uiState.value.rows
        .filterIsInstance<ProjectsListRow.ProjectEntry>()
        .single { it.project.name == name }

    private fun ProjectsViewModel.titles(name: String) = entry(name).agents.map { it.title }

    @Test
    fun `the demo lists its seen agents gray under their projects`() = runTest {
        val vm = subscribed(demoSession())
        val mobile = vm.entry("mobile-app")
        assertTrue(mobile.archivable)
        assertEquals(
            listOf("Dark mode for settings", "Remove unused deps"),
            vm.titles("mobile-app")
        )
        assertTrue(mobile.agents.all { it.seen })
        assertEquals(0, mobile.foldedSeen)
        val design = vm.entry("design-system").agents.single()
        assertEquals("Fix flaky snapshot test", design.title)
        assertEquals(AgentState.Error, design.state)
        assertTrue(design.seen)
    }

    @Test
    fun `an archive hides the row behind Undo, then reaches the Mac`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        val mobile = vm.entry("mobile-app")
        val deps = mobile.agents.single { it.title == "Remove unused deps" }
        vm.archiveAgent(mobile.project, deps)
        t.scheduler.runCurrent()
        assertEquals(listOf("Dark mode for settings"), vm.titles("mobile-app"))
        assertEquals("Remove unused deps", vm.uiState.value.pendingArchive?.agents?.single()?.title)

        vm.undoArchive()
        t.scheduler.runCurrent()
        assertEquals(
            listOf("Dark mode for settings", "Remove unused deps"),
            vm.titles("mobile-app")
        )
        assertNull(vm.uiState.value.pendingArchive)

        vm.archiveAgent(mobile.project, deps)
        t.settle(UNDO_CLOSE_MS + 1_000)
        assertNull(vm.uiState.value.pendingArchive)
        assertEquals(listOf("Dark mode for settings"), vm.titles("mobile-app"))
    }

    @Test
    fun `mark as unread takes a seen row back to new, and mark as seen mutes it again`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        val mobile = vm.entry("mobile-app")
        val deps = mobile.agents.single { it.title == "Remove unused deps" }
        vm.markAgentUnread(mobile.project, deps)
        t.settle()
        val unread = vm.entry("mobile-app").agents
        assertEquals(
            listOf("Remove unused deps", "Dark mode for settings"),
            vm.titles("mobile-app")
        )
        assertFalse(unread.first().seen)

        vm.markAgentSeen(mobile.project, unread.first())
        t.settle()
        assertTrue(vm.entry("mobile-app").agents.all { it.seen })
    }

    @Test
    fun `a project's folded seen agents open in place and fold again`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        val mobile = vm.entry("mobile-app")
        vm.toggleSeenAgents(mobile.project)
        t.scheduler.runCurrent()
        assertTrue(vm.entry("mobile-app").seenExpanded)
        vm.toggleSeenAgents(mobile.project)
        t.scheduler.runCurrent()
        assertFalse(vm.entry("mobile-app").seenExpanded)
    }
}
