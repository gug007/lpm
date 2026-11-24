package cx.lpm.mobile.core.data.files

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.LocatedKind
import cx.lpm.mobile.core.model.Project
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ProjectFilesStoreTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private val listing =
        """{"t":"listDir","project":"storefront","dir":"src","ok":true,""" +
            """"root":"/Users/me/storefront",""" +
            """"entries":[{"name":"app","dir":true,"ignored":false,"changed":2},""" +
            """{"name":"index.ts","dir":false,"ignored":false,"status":"modified"}]}"""

    @Test
    fun `only a Mac that lists folders, and never for an SSH project`() = runTest {
        val h = SessionHarness(this)
        h.connectReady(listOf(LpmClient.LIST_DIR_FEATURE))
        val store = h.session.store<ProjectFilesStore>()
        val local = Project.parse(buildJsonObject { put("name", "storefront") })
        assertTrue(store.canBrowseFiles(local))
        assertFalse(store.canBrowseFiles(local.copy(isRemote = true)))
    }

    @Test
    fun `a folder loads, keeps the root, and keeps its rows while it reloads`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.LIST_DIR_FEATURE))
        val store = h.session.store<ProjectFilesStore>()

        store.load("storefront", "src")
        val sent = socket.sentOf("listDir").single()
        assertEquals(JsonPrimitive("src"), sent["dir"])
        assertTrue(store.state.value.folder("storefront", "src").loading)

        socket.receive(listing)
        settle()
        val folder = store.state.value.folder("storefront", "src")
        assertFalse(folder.loading)
        assertEquals(listOf("app", "index.ts"), folder.entries?.map { it.name })
        assertEquals("/Users/me/storefront", store.state.value.roots["storefront"])

        store.load("storefront", "src")
        val reloading = store.state.value.folder("storefront", "src")
        assertTrue(reloading.loading)
        assertEquals(2, reloading.entries?.size)
    }

    @Test
    fun `a failure replaces the rows, and silence times out`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.LIST_DIR_FEATURE))
        val store = h.session.store<ProjectFilesStore>()
        store.load("storefront", "src")
        socket.receive(listing)
        settle()

        store.load("storefront", "src")
        socket.receive(
            """{"t":"listDir","project":"storefront","dir":"src","ok":false,""" +
                """"error":"No such folder"}"""
        )
        settle()
        val failed = store.state.value.folder("storefront", "src")
        assertNull(failed.entries)
        assertEquals("No such folder", failed.error)

        store.load("storefront", "lib")
        settle(20_000)
        assertEquals(
            "The Mac didn't answer in time.",
            store.state.value.folder("storefront", "lib").error
        )
    }

    @Test
    fun `refresh waits for the answer`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.LIST_DIR_FEATURE))
        val store = h.session.store<ProjectFilesStore>()
        var done = false
        launch {
            store.refresh("storefront", "src")
            done = true
        }
        settle()
        assertFalse(done)
        socket.receive(listing)
        settle()
        assertTrue(done)
    }

    @Test
    fun `a folder outside the project is listed by its absolute path`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.LOCATE_PATH_FEATURE))
        val store = h.session.store<ProjectFilesStore>()
        store.load("storefront", "/var/log")
        assertEquals(JsonPrimitive("/var/log"), socket.sentOf("listDir").single()["dir"])
        socket.receive(
            """{"t":"listDir","project":"storefront","dir":"/var/log","ok":true,""" +
                """"root":"/work/storefront","entries":[{"name":"api","dir":true,"ignored":false}]}"""
        )
        settle()
        assertEquals(
            listOf("api"),
            store.state.value.folder("storefront", "/var/log").entries?.map { it.name }
        )
        assertNull(store.state.value.folder("storefront", "var/log").entries)
    }

    @Test
    fun `a typed path is located, and silence leaves it to the index`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(listOf(LpmClient.LOCATE_PATH_FEATURE))
        val store = h.session.store<ProjectFilesStore>()
        assertTrue(store.canLocatePaths)
        store.locate("storefront", "/etc/hosts")
        assertEquals(JsonPrimitive("/etc/hosts"), socket.sentOf("locatePath").single()["path"])
        assertNull(store.state.value.located("storefront", "/etc/hosts"))

        socket.receive(
            """{"t":"locatePath","project":"storefront","path":"/etc/hosts","ok":true,""" +
                """"kind":"file","at":"/etc/hosts","rel":null}"""
        )
        settle()
        assertEquals(LocatedKind.FILE, store.state.value.located("storefront", "/etc/hosts")?.kind)
        assertNull(store.state.value.located("storefront", "/etc/host"))

        store.locate("storefront", "/srv")
        settle(10_000)
        val silent = store.state.value.located("storefront", "/srv")
        assertEquals("/srv", silent?.typed)
        assertNull(silent?.kind)
    }
}
