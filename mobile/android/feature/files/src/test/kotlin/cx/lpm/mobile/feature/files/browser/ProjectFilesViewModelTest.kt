package cx.lpm.mobile.feature.files.browser

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.files.ProjectFilesStore
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.navigation.ProjectFilesKey
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
class ProjectFilesViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.connected(
        features: List<String> = listOf(
            LpmClient.LIST_DIR_FEATURE,
            LpmClient.LOCATE_PATH_FEATURE
        )
    ): Pair<TestSession, FakeSocket> {
        val t = TestSession(this, setOf(SessionStore.Factory(::ProjectFilesStore)))
        val socket = t.connectReady(features = features)
        return t to socket
    }

    private fun TestScope.subscribed(t: TestSession, dir: String = ""): ProjectFilesViewModel {
        val vm = ProjectFilesViewModel(ProjectFilesKey("storefront", dir), t.sessions)
        backgroundScope.launch { vm.uiState.collect() }
        testScheduler.runCurrent()
        return vm
    }

    private fun TestScope.receive(socket: FakeSocket, frame: String) {
        socket.receive(frame)
        testScheduler.runCurrent()
    }

    @Test
    fun `a folder lists its entries under its own name`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t, "src/app")
        vm.load()
        testScheduler.runCurrent()
        assertEquals(JsonPrimitive("src/app"), socket.sentOf("listDir").single()["dir"])
        assertEquals(1, socket.sentOf("mentions").size)
        assertEquals("app", vm.uiState.value.folderName)
        assertNull(vm.uiState.value.entries)

        receive(
            socket,
            """{"t":"listDir","project":"storefront","dir":"src/app","ok":true,""" +
                """"root":"/Users/me/sf",""" +
                """"entries":[{"name":"checkout","dir":true,"changed":2},{"name":"page.tsx"}]}"""
        )
        val state = vm.uiState.value
        assertEquals(listOf("checkout", "page.tsx"), state.entries?.map { it.name })
        assertEquals("/Users/me/sf", state.root)
    }

    @Test
    fun `Go to File searches the project's index once it's in`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        vm.load()
        vm.setQuery("  check ")
        testScheduler.runCurrent()
        assertEquals("check", vm.uiState.value.search)
        assertNull(vm.uiState.value.hits)

        receive(
            socket,
            """{"t":"mentions","project":"storefront","entries":[""" +
                """{"path":"src/app/checkout/page.tsx"},""" +
                """{"path":"components/CheckoutButton.tsx"},""" +
                """{"path":"README.md"}]}"""
        )
        assertEquals(
            listOf("components/CheckoutButton.tsx", "src/app/checkout/page.tsx"),
            vm.uiState.value.hits?.map { it.path }
        )
        vm.setQuery("")
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.hits)
    }

    @Test
    fun `a folder that fails says why and tries again`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t, "gone")
        vm.load()
        receive(
            socket,
            """{"t":"listDir","project":"storefront","dir":"gone","ok":false,""" +
                """"error":"No such folder"}"""
        )
        assertEquals("No such folder", vm.uiState.value.error)
        vm.retry()
        testScheduler.runCurrent()
        assertEquals(2, socket.sentOf("listDir").size)
    }

    @Test
    fun `a typed path is asked about after a pause, once`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        vm.setQuery("/etc/ho")
        vm.setQuery("/etc/hosts ")
        testScheduler.runCurrent()
        assertTrue(vm.uiState.value.showsPath)
        assertNull(vm.uiState.value.located)
        assertEquals(0, socket.sentOf("locatePath").size)
        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()
        assertEquals(JsonPrimitive("/etc/hosts"), socket.sentOf("locatePath").single()["path"])

        receive(
            socket,
            """{"t":"locatePath","project":"storefront","path":"/etc/hosts","ok":true,""" +
                """"kind":"file","at":"/etc/hosts","rel":null}"""
        )
        assertEquals("/etc/hosts", vm.uiState.value.located?.path)
        assertTrue(vm.uiState.value.showsPath)
        assertFalse(vm.uiState.value.pathMissing)

        vm.setQuery("hosts")
        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()
        assertNull(vm.uiState.value.path)
        assertEquals(1, socket.sentOf("locatePath").size)
    }

    @Test
    fun `a path that leads nowhere has no row, and an older Mac is never asked`() = runTest {
        val (t, socket) = connected()
        val vm = subscribed(t)
        vm.setQuery("/api")
        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()
        receive(
            socket,
            """{"t":"locatePath","project":"storefront","path":"/api","ok":true,""" +
                """"kind":"missing","at":"/api","rel":null}"""
        )
        assertFalse(vm.uiState.value.showsPath)
        assertTrue(vm.uiState.value.pathMissing)

        val (older, quiet) = connected(listOf(LpmClient.LIST_DIR_FEATURE))
        val old = subscribed(older)
        old.setQuery("/api")
        testScheduler.advanceTimeBy(300)
        testScheduler.runCurrent()
        assertNull(old.uiState.value.path)
        assertEquals(0, quiet.sentOf("locatePath").size)
    }
}
