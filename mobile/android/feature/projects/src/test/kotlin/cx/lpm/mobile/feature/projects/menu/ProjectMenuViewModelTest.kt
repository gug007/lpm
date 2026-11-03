package cx.lpm.mobile.feature.projects.menu

import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.WorkState
import cx.lpm.mobile.core.model.WorkStatusInput
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ProjectMenuViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.subscribed(
        t: TestSession,
        project: String = "storefront"
    ): ProjectMenuViewModel {
        val vm = ProjectMenuViewModel(project, SessionKey.Live, t.sessions)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    @Test
    fun `the menu counts storefront's changes and new automation runs`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.onAppear()
        t.settle()
        val state = vm.uiState.value
        assertEquals(4, state.changedCount)
        assertEquals(1, state.unreadAutomations)
        assertTrue(state.branch.isNotEmpty())
        assertTrue(state.project?.running == true)
    }

    @Test
    fun `History shows for a project the Mac lists commits for`() = runTest {
        val t = demoSession()
        assertTrue(subscribed(t).uiState.value.canShowHistory)
    }

    @Test
    fun `the menu reads the Claude accounts its Claude Account menu lists`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        assertNull(t.store<ClaudeAccountsStore>().state.value.accounts)
        vm.onAppear()
        t.settle()
        assertTrue(t.store<ClaudeAccountsStore>().state.value.accounts?.hasAdded == true)
    }

    @Test
    fun `a status with a note lands on the project, and Clear takes it off`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.setWorkStatus(WorkStatusInput(WorkState.Blocked, note = "Needs keys"))
        t.settle()
        val status = vm.uiState.value.project?.workStatus
        assertEquals(WorkState.Blocked, status?.state)
        assertEquals("Needs keys", status?.note)

        vm.setWorkStatus(null)
        t.settle()
        assertNull(vm.uiState.value.project?.workStatus)
    }

    @Test
    fun `rename relabels the project once the Mac writes it`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.rename("Shop")
        t.settle()
        assertEquals("Shop", vm.uiState.value.project?.label)
    }

    @Test
    fun `a discard offers Undo, which brings the changes back`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.onAppear()
        t.settle()
        vm.discardAll()
        t.settle()
        val notice = vm.uiState.value.notice
        assertEquals("Discarded all changes", notice?.text)
        assertEquals(0, vm.uiState.value.changedCount)

        vm.restoreDiscarded(notice!!.undo!!)
        t.settle()
        assertEquals("Restored the discarded changes", vm.uiState.value.notice?.text)
        assertNull(vm.uiState.value.notice?.undo)
        assertEquals(4, vm.uiState.value.changedCount)
    }

    @Test
    fun `stop puts the menu button in its spinner until the Mac answers`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.stop()
        t.scheduler.runCurrent()
        assertTrue(vm.uiState.value.pending)
        t.settle(5_000)
        assertEquals(false, vm.uiState.value.project?.running)
    }

    @Test
    fun `Commands shows on a Mac that keeps lpm commands`() = runTest {
        val vm = subscribed(demoSession())
        assertTrue(vm.uiState.value.canManageCommands)
    }

    @Test
    fun `Commands stays out on a Mac without lpm commands`() = runTest {
        val t = TestSession(this, ScreenStores)
        t.connectReady()
        val vm = subscribed(t)
        assertEquals(false, vm.uiState.value.canManageCommands)
    }
}
