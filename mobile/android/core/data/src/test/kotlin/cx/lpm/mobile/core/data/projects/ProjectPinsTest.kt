package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectPinsTest {
    private fun TestScope.settle() = testScheduler.runCurrent()

    private fun FakeSocket.projects(vararg names: String) = receive(
        """{"t":"projects","projects":[${names.joinToString(",") { """{"name":"$it"}""" }}]}"""
    )

    @Test
    fun `the Pinned section lists the pins there is a project for, in pinned order`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.PROJECT_PINS_FEATURE))
        socket.projects("api", "web", "blog")
        socket.receive(
            """{"t":"sidebar","order":[],"groups":[],"pins":["blog","gone","api","blog"]}"""
        )
        settle()
        val state = h.projects.state.value
        assertEquals(listOf("blog", "api"), state.pinnedProjects.map { it.name })
        assertTrue(h.projects.canPinProjects)
    }

    @Test
    fun `a pin shows at once and the reply carries the pins the Mac kept`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.PROJECT_PINS_FEATURE))
        socket.projects("api", "web")
        settle()
        val store = h.projects
        val web = store.state.value.project("web")!!
        store.setPinned(web, true)
        assertEquals(listOf("web"), store.state.value.pins)
        val sent = socket.sentOf("sidebarPin").single()
        assertEquals("web", sent.string("project"))
        assertEquals(true, sent.bool("pinned"))

        socket.receive(
            """{"t":"sidebarPin","ok":true,"order":[],"groups":[],"pins":["api","web"]}"""
        )
        settle()
        assertEquals(listOf("api", "web"), store.state.value.pins)

        store.setPinned(web, false)
        assertEquals(listOf("api"), store.state.value.pins)
        assertFalse(store.state.value.isPinned(web))
    }

    @Test
    fun `a pin the Mac refused comes back off and the sidebar is asked again`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.PROJECT_PINS_FEATURE))
        socket.projects("api")
        settle()
        val asked = socket.sentOf("sidebar").size
        h.projects.setPinned(h.projects.state.value.project("api")!!, true)
        socket.receive("""{"t":"sidebarPin","ok":false,"error":"No such project"}""")
        settle()
        assertEquals(asked + 1, socket.sentOf("sidebar").size)
        socket.receive("""{"t":"sidebar","order":[],"groups":[],"pins":[]}""")
        settle()
        assertTrue(h.projects.state.value.pins.isEmpty())
    }

    @Test
    fun `a sidebar-changed push asks for the sidebar again`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val asked = socket.sentOf("sidebar").size
        socket.receive("""{"t":"sidebar-changed"}""")
        settle()
        assertEquals(asked + 1, socket.sentOf("sidebar").size)
        assertFalse(h.projects.canPinProjects)
    }
}
