package cx.lpm.mobile.core.data.actions

import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPopupCopy
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ActionPopupStoreTest {
    private fun TestScope.ready(): Pair<FakeSocket, ActionPopupStore> {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf("actionPopup"))
        return socket to h.session.store()
    }

    private fun action(popup: String = """{ "format": "html", "width": 380, "height": 200 }""") =
        Action.parse(
            Json.parseToJsonElement("""{ "name": "stars", "label": "Stars", "popup": $popup }""")
                .jsonObject
        )

    private fun FakeSocket.page(html: String = "<p>1</p>", data: String = "1", extra: String = "") =
        receive(
            """{"t":"actionPopup","project":"api","action":"stars","ok":true,"popup":""" +
                """{"format":"html","title":"GitHub stars","width":380,"height":200,""" +
                """"refresh":5,"html":"$html","data":$data$extra}}"""
        )

    private val ActionPopupStore.popup get() = state.value.popup("api", "stars")

    @Test
    fun `opening asks for the page and shows it`() = runTest {
        val (socket, store) = ready()
        assertTrue(store.available)
        store.open("api", action())
        val asked = socket.sentOf("actionPopup").single()
        assertEquals("api", asked.string("project"))
        assertEquals("stars", asked.string("action"))
        assertNull("an opening reuses a recent result", asked.bool("fresh"))
        assertEquals(ActionPopupPhase.Loading, store.popup.phase)

        socket.page()
        runCurrent()
        assertEquals("<p>1</p>", store.popup.content?.html)
        assertEquals(1, store.popup.page)
        assertFalse(store.popup.inFlight)
    }

    @Test
    fun `a refresh with the same page pushes its values, a new page loads`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        socket.page()
        runCurrent()
        store.tick("api", "stars")
        assertNull("a refresh follows the cache", socket.sentOf("actionPopup").last().bool("fresh"))
        store.tick("api", "stars")
        assertEquals("one refresh at a time", 2, socket.sentOf("actionPopup").size)

        socket.page(data = "2")
        runCurrent()
        assertEquals(1, store.popup.page)
        assertEquals(1, store.popup.pushes)
        assertEquals("2", store.popup.content?.data.toString())

        store.tick("api", "stars")
        socket.page(html = "<p>2</p>")
        runCurrent()
        assertEquals(2, store.popup.page)
    }

    @Test
    fun `refresh keeps the page up and then loads it anew`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        socket.page()
        runCurrent()
        store.reload("api", "stars")
        assertEquals("<p>1</p>", store.popup.content?.html)
        assertTrue(store.popup.inFlight)
        assertEquals(true, socket.sentOf("actionPopup").last().bool("fresh"))
        socket.page()
        runCurrent()
        assertEquals("the same page still reloads", 2, store.popup.page)
    }

    @Test
    fun `failures read as errors to retry`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        socket.receive(
            """{"t":"actionPopup","project":"api","action":"stars","ok":false,"error":"No action."}"""
        )
        runCurrent()
        assertEquals(ActionPopupPhase.Failed("No action.", retry = true), store.popup.phase)

        store.reload("api", "stars")
        socket.page(extra = ""","error":"Can't find popups/x.html."""")
        runCurrent()
        assertEquals(
            ActionPopupPhase.Failed("Can't find popups/x.html.", retry = true),
            store.popup.phase
        )

        store.reload("api", "stars")
        socket.receive(
            """{"t":"actionPopup","project":"api","action":"stars","ok":true,"popup":""" +
                """{"format":"vega","html":"<p>"}}"""
        )
        runCurrent()
        assertEquals(
            ActionPopupPhase.Failed(ActionPopupCopy.NEWER_APP, retry = false),
            store.popup.phase
        )
        assertFalse(store.popup.canReload)
    }

    @Test
    fun `a Mac that doesn't answer times out, over a page it couldn't refresh`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        settleAlive(socket, 20_000)
        assertEquals(
            ActionPopupPhase.Failed(ActionPopupCopy.LATE_ANSWER, retry = true),
            store.popup.phase
        )

        store.reload("api", "stars")
        socket.page()
        runCurrent()
        store.tick("api", "stars")
        settleAlive(socket, 20_000)
        assertEquals("<p>1</p>", store.popup.content?.html)
        assertFalse(store.popup.inFlight)
        assertEquals("Couldn't refresh: ${ActionPopupCopy.LATE_ANSWER}", store.popup.note)
    }

    @Test
    fun `a stale result shows at once and a fresh one follows`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        socket.page(extra = ""","stale":true,"updatedAt":1792089000123""")
        runCurrent()
        assertEquals("<p>1</p>", store.popup.content?.html)
        assertEquals(1792089000123, store.popup.content?.updatedAt)
        assertTrue(store.popup.inFlight)
        assertEquals(true, socket.sentOf("actionPopup").last().bool("fresh"))

        socket.page(data = "2", extra = ""","stale":true""")
        runCurrent()
        assertEquals("swapped in without a reload", 1, store.popup.page)
        assertEquals(1, store.popup.pushes)
        assertEquals("a fresh answer never asks again", 2, socket.sentOf("actionPopup").size)
        assertFalse(store.popup.inFlight)
    }

    @Test
    fun `a failure over a page keeps it and says it couldn't refresh`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        socket.page(extra = ""","dataError":"exit 1"""")
        runCurrent()
        assertEquals("Data: exit 1", store.popup.note)

        socket.page(extra = ""","dataError":"exit 1","refreshError":"gh: offline"""")
        runCurrent()
        assertEquals("Couldn't refresh: gh: offline", store.popup.note)

        store.reload("api", "stars")
        socket.receive(
            """{"t":"actionPopup","project":"api","action":"stars","ok":false,"error":"Gone."}"""
        )
        runCurrent()
        assertEquals("<p>1</p>", store.popup.content?.html)
        assertEquals("Couldn't refresh: Gone.", store.popup.note)

        socket.page()
        runCurrent()
        assertNull(store.popup.note)
    }

    @Test
    fun `a config problem or unknown format shows without asking`() = runTest {
        val (socket, store) = ready()
        store.open("api", action("""{ "format": "html", "problem": "needs a format key" }"""))
        assertEquals(
            ActionPopupPhase.Failed("needs a format key", retry = false),
            store.popup.phase
        )
        store.open("api", action("""{ "format": "vega" }"""))
        assertEquals(
            ActionPopupPhase.Failed(ActionPopupCopy.NEWER_APP, retry = false),
            store.popup.phase
        )
        store.reload("api", "stars")
        assertTrue(socket.sentOf("actionPopup").isEmpty())
    }

    @Test
    fun `a dead page shows an error, and a closed sheet ignores late replies`() = runTest {
        val (socket, store) = ready()
        store.open("api", action())
        socket.page()
        runCurrent()
        store.pageFailed("api", "stars")
        assertEquals(
            ActionPopupPhase.Failed(ActionPopupCopy.STOPPED, retry = true),
            store.popup.phase
        )

        store.close("api", "stars")
        socket.page()
        runCurrent()
        assertTrue(store.state.value.popups.isEmpty())
    }
}
