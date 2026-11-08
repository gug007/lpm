package cx.lpm.mobile.feature.projects.detail

import cx.lpm.mobile.core.data.git.GitChecksStore
import cx.lpm.mobile.core.model.crashed
import cx.lpm.mobile.core.navigation.ProjectKey
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

class ProjectDetailViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.subscribed(
        t: TestSession,
        project: String = "storefront"
    ): ProjectDetailViewModel {
        val vm = ProjectDetailViewModel(ProjectKey(project), t.sessions, t.clock, t.feeds, t.tips)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    private fun ProjectDetailUiState.service(name: String) = services.single {
        it.service.name ==
            name
    }

    @Test
    fun `storefront lists its tabs and services once loaded`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        assertNull(vm.uiState.value.tabs)

        vm.load()
        t.settle()
        val state = vm.uiState.value
        assertEquals("storefront", state.title)
        assertEquals(DetailSubtitle.Running, state.subtitle)
        assertEquals("Terminal 1", state.tabs?.first()?.terminal?.label)
        assertEquals(listOf("web", "api", "worker"), state.services.map { it.service.name })
        assertEquals(2, state.runningServices)
        assertTrue(state.canStopAll)
        assertFalse(state.isEmpty)
    }

    @Test
    fun `the title carries the project's changes while the screen shows`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.appear()
        t.settle()
        val git = vm.uiState.value.git
        assertEquals(4, git?.files?.size)
        assertTrue((git?.linesAdded ?: 0) > 0)
        vm.disappear()
    }

    @Test
    fun `a service toggle spins until the service moves`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.toggleService("worker")
        t.scheduler.runCurrent()
        assertTrue(vm.uiState.value.service("worker").pending)

        t.settle(1_500)
        val worker = vm.uiState.value.service("worker")
        assertFalse(worker.pending)
        assertTrue(worker.running)
    }

    @Test
    fun `the demo worker, started on its own, crashes and restarts`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.toggleService("worker")
        t.settle(5_000)
        val crashed = vm.uiState.value.service("worker")
        assertFalse(crashed.running)
        assertEquals(1, crashed.ended?.exitCode)
        assertTrue(crashed.ended?.crashed == true)

        vm.restartService("worker")
        t.settle(1_500)
        val restarted = vm.uiState.value.service("worker")
        assertTrue(restarted.running)
        assertNull(restarted.ended)
    }

    @Test
    fun `stop all waits on the Mac, then the project reads stopped`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.stopAll()
        t.scheduler.runCurrent()
        assertTrue(vm.uiState.value.stopping)

        t.settle(5_000)
        val state = vm.uiState.value
        assertFalse(state.stopping)
        assertEquals(DetailSubtitle.Stopped, state.subtitle)
        assertEquals(0, state.runningServices)
        assertFalse(state.canStopAll)
    }

    @Test
    fun `a new tab shows a placeholder until it lands`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.load()
        t.settle()
        val before = vm.uiState.value.tabs.orEmpty().size
        vm.newTerminal()
        t.scheduler.runCurrent()
        assertTrue(vm.uiState.value.creating)

        t.settle(5_000)
        assertFalse(vm.uiState.value.creating)
        assertEquals(before + 1, vm.uiState.value.tabs?.size)
    }

    @Test
    fun `the Git section shows the branch, its changes and its pull request's CI`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.load()
        vm.appear()
        t.store<GitChecksStore>().load("storefront")
        t.settle()
        val state = vm.uiState.value
        assertTrue(state.showsGit)
        assertTrue(state.hasChanges)
        assertEquals("feat/checkout-redesign", state.git?.branch)
        assertEquals(42, state.checks?.pr?.number)
        assertEquals("1 failing", state.checks?.label)
        vm.disappear()
    }
}
