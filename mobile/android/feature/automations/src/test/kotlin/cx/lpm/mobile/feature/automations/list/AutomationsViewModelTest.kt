package cx.lpm.mobile.feature.automations.list

import cx.lpm.mobile.core.navigation.AutomationsKey
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.automations.demoSession
import cx.lpm.mobile.feature.automations.format.AutomationTone
import cx.lpm.mobile.feature.automations.settle
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class AutomationsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.list(t: TestSession, project: String? = null): AutomationsViewModel {
        val vm = AutomationsViewModel(AutomationsKey(project), t.sessions, t.clock)
        keepCollecting(vm.uiState)
        vm.load()
        t.settle()
        return vm
    }

    @Test
    fun `the demo's last night run waits under New, the paused job under Earlier`() = runTest {
        val t = demoSession()
        val state = list(t).uiState.value
        assertTrue(state.loaded)
        // The job waiting on an answer leads, ahead of last night's run.
        val (release, nightly) = state.unread
        assertEquals("Release notes", release.job.displayName)
        assertEquals(
            "1 new message · Waiting for your answer · Publish the v2.4 release notes to the blog?",
            release.status
        )
        assertEquals(AutomationTone.Orange, release.statusTone)
        assertEquals("Nightly tests", nightly.job.displayName)
        assertEquals("storefront", nightly.scope)
        assertEquals("1 new message · Every day at 03:00 · in 15 hours", nightly.status)
        assertEquals(AutomationTone.Green, nightly.statusTone)
        val weekly = state.read.single()
        assertEquals("blog", weekly.scope)
        assertEquals("Off · Mon at 06:00", weekly.status)
        assertEquals("📦", weekly.emoji)
    }

    @Test
    fun `mark all read empties New`() = runTest {
        val t = demoSession()
        val vm = list(t)
        vm.markAllRead()
        t.settle()
        assertTrue(vm.uiState.value.unread.isEmpty())
        assertEquals(3, vm.uiState.value.read.size)
    }

    @Test
    fun `a project's page lists only its own jobs, without the scope tag`() = runTest {
        val t = demoSession()
        val vm = list(t, project = "storefront")
        val rows = vm.uiState.value.unread + vm.uiState.value.read
        assertEquals(listOf("nightly-tests"), rows.map { it.job.id })
        assertEquals("", rows.single().scope)
        vm.markAllRead()
        t.settle()
        assertTrue(vm.uiState.value.unread.isEmpty())
    }

    @Test
    fun `with nothing failed the Failed filter stays off`() = runTest {
        val t = demoSession()
        val vm = list(t)
        assertEquals(0, vm.uiState.value.failedCount)
        vm.toggleFailedOnly()
        t.settle()
        assertEquals(false, vm.uiState.value.failedOnly)
        assertEquals(3, (vm.uiState.value.unread + vm.uiState.value.read).size)
    }

    @Test
    fun `turning a job on, running and stopping it`() = runTest {
        val t = demoSession()
        val vm = list(t)
        val weekly = vm.uiState.value.read.single().job
        vm.toggleEnabled(weekly)
        t.settle()
        val on = vm.uiState.value.row(weekly.id)
        assertTrue(on.job.enabled)
        assertEquals("Mon at 06:00 · in 4 days", on.status)

        vm.run(on.job)
        t.settle()
        val running = vm.uiState.value.row(weekly.id)
        assertTrue(running.job.running)
        assertEquals("Running", running.status)
        assertEquals(AutomationTone.Blue, running.statusTone)

        vm.stop(running.job)
        t.settle()
        val stopped = vm.uiState.value.row(weekly.id)
        assertEquals(false, stopped.job.running)
    }
}

private fun AutomationsUiState.row(id: String) = (unread + read).single { it.job.id == id }
