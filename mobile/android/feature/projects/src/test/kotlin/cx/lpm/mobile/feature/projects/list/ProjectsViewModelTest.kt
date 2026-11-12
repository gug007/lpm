package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MachineVisit
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.WorkState
import cx.lpm.mobile.core.model.WorkStatusInput
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.projects.BUILD_BOX
import cx.lpm.mobile.feature.projects.ScreenStores
import cx.lpm.mobile.feature.projects.demoSession
import cx.lpm.mobile.feature.projects.liveWithMachines
import cx.lpm.mobile.feature.projects.settle
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ProjectsViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.subscribed(t: TestSession): ProjectsViewModel {
        val vm = ProjectsViewModel(t.session, t.clock, t.device, t.feeds, t.tips)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    private val ProjectsUiState.labels: List<String>
        get() = rows.map {
            when (it) {
                is ProjectsListRow.ProjectEntry ->
                    (if (it.indented) "  " else "") + it.project.name

                is ProjectsListRow.FolderEntry -> "[${it.folder.name} ${it.count}]"

                is ProjectsListRow.MachineEntry -> "<${it.name}>"

                is ProjectsListRow.MachineProjectEntry -> "  ${it.slug}:${it.project.name}"
            }
        }

    @Test
    fun `the demo list reads like the desktop sidebar`() = runTest {
        val t = demoSession()
        val state = subscribed(t).uiState.value
        assertEquals(
            listOf(
                "storefront",
                "api-gateway",
                "mobile-app",
                "[Client Work 2]",
                "  blog",
                "  design-system"
            ),
            state.labels
        )
        assertTrue(state.demoMode)
        assertTrue(state.loaded)
        assertFalse(state.listIsEmpty)
        assertEquals("Demo Mac", state.title.name)
        assertEquals("Demo · sample projects", state.title.status.text)
    }

    @Test
    fun `shutting a folder hides its projects and opening it brings them back`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        val folder = vm.uiState.value.rows.filterIsInstance<ProjectsListRow.FolderEntry>().single()
        vm.toggleFolder(folder.folder, expandedNow = folder.expanded)
        t.settle()
        val shut = vm.uiState.value
        assertEquals("[Client Work 2]", shut.labels.last())
        assertFalse(shut.rows.filterIsInstance<ProjectsListRow.FolderEntry>().single().expanded)

        vm.toggleFolder(folder.folder, expandedNow = false)
        t.settle()
        assertEquals("  design-system", vm.uiState.value.labels.last())
    }

    @Test
    fun `a start spins on its row until the Mac says it runs`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        val api = t.store<ProjectsStore>().state.value.project("api-gateway")!!
        vm.start(api, profile = "")
        t.scheduler.runCurrent()
        assertTrue(vm.uiState.value.entry("api-gateway").pending)

        t.settle(5_000)
        val entry = vm.uiState.value.entry("api-gateway")
        assertFalse(entry.pending)
        assertTrue(entry.project.running)
    }

    @Test
    fun `a status shows on the row at once`() = runTest {
        val t = demoSession()
        val vm = subscribed(t)
        vm.setWorkStatus("blog", WorkStatusInput(WorkState.Blocked, note = "Waiting on review"))
        t.scheduler.runCurrent()
        val status = vm.uiState.value.entry("blog").project.workStatus
        assertEquals(WorkState.Blocked, status?.state)
        assertEquals("Waiting on review", status?.note)
    }

    @Test
    fun `the Status menu offers the built-in states and the Mac's own`() = runTest {
        val t = demoSession()
        val menu = subscribed(t).uiState.value.workStatusMenu.map { it.label }
        assertEquals(
            listOf(
                "In progress",
                "Review",
                "Ready",
                "Done",
                "Blocked",
                "Waiting",
                "Needs decision",
                "Paused",
                "QA"
            ),
            menu
        )
    }

    @Test
    fun `unread automations light the menu`() = runTest {
        val t = demoSession()
        assertTrue(subscribed(t).uiState.value.automationsUnread > 0)
    }

    @Test
    fun `the Mac's machines follow its projects with theirs nested under them`() = runTest {
        val (t, _) = liveWithMachines()
        val vm = subscribed(t)
        val state = vm.uiState.value
        assertEquals(listOf("web", "<Build Box>", "  box:api", "  box:api-2"), state.labels)
        val header = state.rows.filterIsInstance<ProjectsListRow.MachineEntry>().single()
        assertEquals(1, header.count)
        assertEquals(MachineDetail.NeedsUpdate, header.detail)
        assertTrue(header.canOpen)
        assertFalse(header.opensOnlyBySwitching)
        val api = state.rows.filterIsInstance<ProjectsListRow.MachineProjectEntry>().first()
        assertEquals(1, api.agents.size)

        vm.toggleMachine("box", expandedNow = true)
        t.settle()
        assertEquals(listOf("web", "<Build Box>"), vm.uiState.value.labels)
    }

    @Test
    fun `a list with only machines isn't empty`() = runTest {
        val t = TestSession(this, ScreenStores)
        val socket = t.connectReady()
        socket.receive("""{"t":"projects","projects":[]}""")
        socket.receive("""{"t":"machines","machines":[$BUILD_BOX]}""")
        t.settle()
        assertFalse(subscribed(t).uiState.value.listIsEmpty)
    }

    @Test
    fun `a machine's project opens in a visit while the Mac stays live`() = runTest {
        val (t, _) = liveWithMachines()
        val vm = subscribed(t)
        val visit = vm.visit("box", "api", terminal = "t1")
        assertEquals(MachineVisit("box", "api", "t1"), visit)
        assertEquals(SessionKey.Visit("box"), t.session.visitSession.value?.key)
        assertEquals("srv-1", t.session.state.value.activeRecord?.serverId)
        assertEquals(null, vm.visit("nowhere", "api"))
    }

    @Test
    fun `switching to a machine through the Mac saves its entry and makes it live`() = runTest {
        val (t, _) = liveWithMachines()
        val vm = subscribed(t)
        vm.switchToMachine("box")
        t.settle()
        val active = t.session.state.value.activeRecord
        assertEquals("Build Box", active?.displayName)
        assertEquals("box", active?.via?.slug)
        assertTrue(t.macStore.loadRecords().any { it.via?.slug == "box" })
    }

    private fun ProjectsUiState.entry(name: String) =
        rows.filterIsInstance<ProjectsListRow.ProjectEntry>().single { it.project.name == name }
}
