package cx.lpm.mobile.feature.projects.visit

import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.session.MachineVisit
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.projects.detail.ProjectDetailViewModel
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

class MachineVisitViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val api = ProjectKey("api", SessionKey.Visit("box"))

    private fun TestScope.visiting(
        project: String = "api"
    ): Triple<TestSession, FakeSocket, FakeSocket> {
        val (t, live) = liveWithMachines()
        val section = t.store<MachineImporter>().section("box")!!
        t.session.beginVisit(section.machine, section.record, project)
        t.settle()
        val relay = t.transport.last
        return Triple(t, live, relay)
    }

    private fun TestScope.subscribed(t: TestSession, key: ProjectKey = api): MachineVisitViewModel {
        val vm = MachineVisitViewModel(key, t.sessions, t.feeds)
        backgroundScope.launch { vm.uiState.collect() }
        t.settle()
        return vm
    }

    @Test
    fun `the project shows as the Mac lists it until the machine answers`() = runTest {
        val (t, _, relay) = visiting()
        val vm = subscribed(t)
        assertEquals(MachineVisitContent.Detail, vm.uiState.value.content)
        assertFalse(vm.uiState.value.ready)
        val detail = ProjectDetailViewModel(api, t.sessions, t.clock, t.feeds, t.tips)
        backgroundScope.launch { detail.uiState.collect() }
        t.settle()
        assertEquals("api", detail.uiState.value.title)

        relay.open()
        t.settle()
        relay.receive("""{"t":"ready","serverId":"srv-box","serverName":"Build Box"}""")
        t.settle()
        assertTrue(vm.uiState.value.ready)
        vm.reload()
        t.settle()
        assertEquals("api", relay.sentOf("terminals").last().string("project"))
        assertEquals("api", relay.sentOf("backgroundRuns").last().string("project"))
    }

    @Test
    fun `a project the machine doesn't have is unavailable once it has listed its own`() = runTest {
        val (t, _, relay) = visiting("gone")
        val vm = subscribed(t, ProjectKey("gone", SessionKey.Visit("box")))
        assertEquals(MachineVisitContent.Loading, vm.uiState.value.content)
        relay.open()
        t.settle()
        relay.receive("""{"t":"ready","serverId":"srv-box","serverName":"Build Box"}""")
        relay.receive("""{"t":"projects","projects":[{"name":"api"}]}""")
        t.settle()
        assertEquals(MachineVisitContent.Unavailable, vm.uiState.value.content)
    }

    @Test
    fun `an ended visit is unavailable`() = runTest {
        val (t, _, _) = visiting()
        val vm = subscribed(t)
        t.session.endVisit()
        t.settle()
        assertEquals(MachineVisitContent.Unavailable, vm.uiState.value.content)
    }

    @Test
    fun `a visit opens its terminal or its project`() {
        assertEquals(
            TerminalKey("api", "t1", SessionKey.Visit("box")),
            MachineVisit("box", "api", "t1").destination
        )
        assertEquals(api, MachineVisit("box", "api").destination)
    }
}
