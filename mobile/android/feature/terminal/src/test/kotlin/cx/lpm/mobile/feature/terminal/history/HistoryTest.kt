package cx.lpm.mobile.feature.terminal.history

import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.long
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class HistoryTest {
    @get:Rule
    val main = MainDispatcherRule()

    private fun TestScope.connected(): Pair<TestSession, FakeSocket> {
        val t = TestSession(this, stores = setOf(SessionStore.Factory(::HistoryStore)))
        return t to t.connectReady()
    }

    private fun item(id: String, at: Long, kind: String = "sent", favorite: Boolean = false) =
        """{"id":"$id","text":"message $id","kind":"$kind","favorite":$favorite,"at":$at,"seq":1,"timestamp":$at}"""

    private fun FakeSocket.page(vararg items: String, hasMore: Boolean = false) =
        receive("""{"t":"historyQuery","items":[${items.joinToString(",")}],"hasMore":$hasMore}""")

    @Test
    fun `pages replace then append, and a superseded reply is dropped`() = runTest {
        val (t, socket) = connected()
        val store = t.store<HistoryStore>()
        store.loadFirst(null, "", favoritesOnly = false, folder = null)
        socket.page(item("a", 3), item("b", 2), hasMore = true)
        testScheduler.runCurrent()
        assertEquals(listOf("a", "b"), store.state.value.items.map { it.id })

        store.loadMore()
        testScheduler.runCurrent()
        val before = socket.sentOf("historyQuery").last()["before"] as JsonObject
        assertEquals(2L, before.long("at"))
        socket.page(item("c", 1))
        testScheduler.runCurrent()
        assertEquals(listOf("a", "b", "c"), store.state.value.items.map { it.id })
        assertFalse(store.state.value.hasMore)

        store.loadFirst(null, "x", favoritesOnly = false, folder = null)
        store.loadFirst(null, "xy", favoritesOnly = false, folder = null)
        socket.page(item("stale", 9))
        testScheduler.runCurrent()
        assertTrue(store.state.value.loading)
        socket.page(item("fresh", 9))
        testScheduler.runCurrent()
        assertEquals(listOf("fresh"), store.state.value.items.map { it.id })
        assertFalse(store.state.value.loading)
    }

    @Test
    fun `unfavoriting in Favorites and moving out of a viewed folder drop the row`() = runTest {
        val (t, socket) = connected()
        val store = t.store<HistoryStore>()
        store.loadFirst(null, "", favoritesOnly = true, folder = null)
        socket.page(item("a", 2, favorite = true), item("b", 1, favorite = true))
        testScheduler.runCurrent()
        store.toggleFavorite("a")
        assertEquals(listOf("b"), store.state.value.items.map { it.id })
        testScheduler.runCurrent()
        assertEquals("a", socket.sentOf("historyToggleFavorite").single().string("id"))

        store.loadFirst(null, "", favoritesOnly = false, folder = "f1")
        socket.page(item("c", 1))
        testScheduler.runCurrent()
        store.setFolder("c", "f2")
        assertTrue(store.state.value.items.isEmpty())
    }

    @Test
    fun `a new folder lands in name order and a closed sheet ignores a straggler`() = runTest {
        val (t, socket) = connected()
        val store = t.store<HistoryStore>()
        socket.receive(
            """{"t":"historyFolders","folders":[{"id":"1","name":"Bugs"},{"id":"3","name":"Ideas"}]}"""
        )
        socket.receive(
            """{"t":"historyCreateFolder","ok":true,"folder":{"id":"2","name":"checkout"}}"""
        )
        testScheduler.runCurrent()
        assertEquals(listOf("Bugs", "checkout", "Ideas"), store.state.value.folders.map { it.name })

        store.loadFirst(null, "", favoritesOnly = false, folder = null)
        store.screenDidClose()
        socket.page(item("late", 1))
        testScheduler.runCurrent()
        assertTrue(store.state.value.items.isEmpty())
        assertFalse(store.state.value.loading)
    }

    @Test
    fun `a replaced socket re-asks the open query and drops a lost page`() = runTest {
        val (t, socket) = connected()
        val store = t.store<HistoryStore>()
        store.loadFirst(null, "fix", favoritesOnly = true, folder = null)
        testScheduler.runCurrent()
        store.onConnectionReset()
        testScheduler.runCurrent()
        val asked = socket.sentOf("historyQuery")
        assertEquals(2, asked.size)
        assertEquals("fix", asked.last().string("search"))
        socket.page(item("a", 1, favorite = true))
        testScheduler.runCurrent()
        assertEquals(listOf("a"), store.state.value.items.map { it.id })

        store.screenDidClose()
        store.onConnectionReset()
        testScheduler.runCurrent()
        assertEquals(2, socket.sentOf("historyQuery").size)
    }

    @Test
    fun `the sheet's Drafts filter keeps only drafts and search waits for a pause`() = runTest {
        val (t, socket) = connected()
        val vm = HistoryViewModel(SessionKey.Live, "", t.sessions)
        backgroundScope.launch { vm.uiState.collect {} }
        testScheduler.advanceTimeBy(301)
        testScheduler.runCurrent()
        assertEquals(1, socket.sentOf("historyQuery").size)
        assertEquals(1, socket.sentOf("historyFolders").size)
        socket.page(item("a", 2, kind = "draft"), item("b", 1))
        testScheduler.runCurrent()
        vm.setFilter(HistoryFilter.Drafts)
        testScheduler.runCurrent()
        socket.page(item("a", 2, kind = "draft"), item("b", 1))
        testScheduler.runCurrent()
        assertEquals(listOf("a"), vm.uiState.value.items.map { it.id })

        vm.setSearch("ch")
        vm.setSearch("che")
        testScheduler.advanceTimeBy(299)
        testScheduler.runCurrent()
        assertEquals(2, socket.sentOf("historyQuery").size)
        testScheduler.advanceTimeBy(2)
        testScheduler.runCurrent()
        assertEquals("che", socket.sentOf("historyQuery").last().string("search"))
    }

    @Test
    fun `the sheet opens on the composer's project and a tap shows every project's`() = runTest {
        val (t, socket) = connected()
        val vm = HistoryViewModel(SessionKey.Live, "storefront", t.sessions)
        backgroundScope.launch { vm.uiState.collect {} }
        testScheduler.advanceTimeBy(301)
        testScheduler.runCurrent()
        assertFalse(vm.uiState.value.allProjects)
        assertEquals("storefront", vm.uiState.value.projectTitle)
        assertEquals("storefront", socket.sentOf("historyQuery").single().string("project"))

        vm.setAllProjects(true)
        testScheduler.runCurrent()
        assertTrue(vm.uiState.value.allProjects)
        assertEquals(2, socket.sentOf("historyQuery").size)
        assertFalse(socket.sentOf("historyQuery").last().containsKey("project"))

        vm.setFilter(HistoryFilter.Favorites)
        vm.setAllProjects(false)
        testScheduler.runCurrent()
        assertEquals("storefront", socket.sentOf("historyQuery").last().string("project"))
    }
}
