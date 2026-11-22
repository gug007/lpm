package cx.lpm.mobile.feature.projects.resume

import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ResumeSessionViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val page =
        """{"t":"agentSessions","project":"storefront","search":"","ok":true,""" +
            """"hasMore":true,"sessions":[""" +
            """{"provider":"claude","sessionId":"a","title":"Fix checkout tax rounding",""" +
            """"updatedAt":0,""" +
            """"openIn":"t1"},""" +
            """{"provider":"codex","sessionId":"b",""" +
            """"title":"Migrate cart store to Zustand","updatedAt":0}]}"""

    private fun TestScope.connected(): Pair<TestSession, FakeSocket> {
        val t = TestSession(this, setOf(SessionStore.Factory(::AgentLaunchStore)))
        val socket = t.connectReady(features = listOf(LpmClient.AGENT_SESSIONS_FEATURE))
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[{"id":"t1",""" +
                """"project":"storefront"}]}"""
        )
        testScheduler.runCurrent()
        return t to socket
    }

    private fun TestScope.subscribed(t: TestSession): ResumeSessionViewModel {
        val vm = ResumeSessionViewModel("storefront", SessionKey.Live, t.sessions, t.clock)
        backgroundScope.launch { vm.uiState.collect() }
        vm.onAppear()
        testScheduler.runCurrent()
        return vm
    }

    @Test
    fun `the list loads at once and filters by agent on the phone`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        assertEquals(1, socket.sentOf("agentSessions").size)
        assertTrue(vm.uiState.value.showsPlaceholder)

        socket.receive(page)
        testScheduler.runCurrent()
        val rows = { vm.uiState.value.groups.flatMap { g -> g.rows.map { it.session.title } } }
        assertEquals(listOf("Fix checkout tax rounding", "Migrate cart store to Zustand"), rows())
        assertEquals(listOf(SessionDay.Older), vm.uiState.value.groups.map { it.day })

        vm.setFilter("codex")
        testScheduler.runCurrent()
        assertEquals(listOf("Migrate cart store to Zustand"), rows())
        assertEquals(1, socket.sentOf("agentSessions").size)

        vm.loadOlder()
        testScheduler.runCurrent()
        assertEquals(JsonPrimitive(80), socket.sentOf("agentSessions").last()["limit"])
    }

    @Test
    fun `typing settles before the Mac is asked again`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        vm.setQuery("c")
        vm.setQuery("ca")
        testScheduler.advanceTimeBy(200)
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("agentSessions").size)

        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()
        val sent = socket.sentOf("agentSessions")
        assertEquals(2, sent.size)
        assertEquals(JsonPrimitive("ca"), sent.last()["search"])
    }

    @Test
    fun `a session already in a tab opens it, any other resumes in a new one`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        socket.receive(page)
        testScheduler.runCurrent()
        val (inTab, closed) = vm.uiState.value.groups.single().rows.map { it.session }

        val spawned = mutableListOf<TerminalInfo>()
        assertEquals("t1", vm.open(inTab) { spawned += it }?.id)
        assertTrue(socket.sentOf("resumeSession").isEmpty())

        assertNull(vm.open(closed) { spawned += it })
        testScheduler.runCurrent()
        assertEquals(JsonPrimitive("b"), socket.sentOf("resumeSession").single()["sessionId"])
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[""" +
                """{"id":"t1","project":"storefront"},{"id":"t2","project":"storefront"}]}"""
        )
        testScheduler.runCurrent()
        assertEquals(listOf("t2"), spawned.map { it.id })
    }

    @Test
    fun `no sessions, no match and a failure each read differently`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        socket.receive(
            """{"t":"agentSessions","project":"storefront","search":"","ok":true,""" +
                """"hasMore":false,"sessions":[]}"""
        )
        testScheduler.runCurrent()
        val empty = vm.uiState.value
        assertTrue(empty.showsPlaceholder && empty.list.loaded && empty.search.isEmpty())

        socket.receive("""{"t":"agentSessions","project":"storefront","ok":false,"error":"Nope"}""")
        testScheduler.runCurrent()
        // Only an answer to a request in flight counts.
        assertNull(vm.uiState.value.list.error)

        vm.retry()
        socket.receive("""{"t":"agentSessions","project":"storefront","ok":false,"error":"Nope"}""")
        testScheduler.runCurrent()
        assertEquals("Nope", vm.uiState.value.list.error)
        assertFalse(vm.uiState.value.list.loading)
    }
}
