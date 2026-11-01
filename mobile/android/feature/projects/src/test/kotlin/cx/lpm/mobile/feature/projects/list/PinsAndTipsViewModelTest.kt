package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.model.AppTip
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.projects.demoSession
import cx.lpm.mobile.feature.projects.settle
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class PinsAndTipsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.subscribed(t: TestSession): ProjectsViewModel {
        val vm = ProjectsViewModel(t.session, t.clock, t.device, t.feeds, t.tips)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    private fun TestSession.project(name: String) =
        store<ProjectsStore>().state.value.project(name)!!

    @Test
    fun `a pinned project shows above the list and keeps its place below`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        assertTrue(vm.uiState.value.pinned.isEmpty())
        assertEquals(false, vm.uiState.value.rows.entry("blog").pinned)

        vm.setPinned(t.project("blog"), true)
        vm.setPinned(t.project("api-gateway"), true)
        t.settle()
        val state = vm.uiState.value
        assertEquals(listOf("blog", "api-gateway"), state.pinned.map { it.project.name })
        assertTrue(state.pinned.all { it.pinLink && it.pinned == true && !it.indented })
        assertEquals("client-work", state.pinned.first().folderId)
        assertEquals(true, state.rows.entry("blog").pinned)
        assertTrue(state.rows.any { it.key == "p:blog" })

        vm.setPinned(t.project("blog"), false)
        t.settle()
        assertEquals(listOf("api-gateway"), vm.uiState.value.pinned.map { it.project.name })
    }

    @Test
    fun `the project menu tip shows until it's closed`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        assertEquals(AppTip.ProjectMenu, vm.uiState.value.tip)
        vm.closeTip(AppTip.ProjectMenu)
        t.settle()
        assertNull(vm.uiState.value.tip)
        t.tips.reset()
        t.settle()
        assertEquals(AppTip.ProjectMenu, vm.uiState.value.tip)
    }

    @Test
    fun `Show All Machines stays out of the menu with no other machine`() = runTest {
        val t = demoSession()
        assertNull(subscribed(t).uiState.value.title.showAllMachines)
    }

    private fun List<ProjectsListRow>.entry(name: String) =
        filterIsInstance<ProjectsListRow.ProjectEntry>().single { it.project.name == name }
}
