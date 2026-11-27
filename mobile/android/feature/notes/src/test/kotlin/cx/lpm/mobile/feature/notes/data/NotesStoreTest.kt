package cx.lpm.mobile.feature.notes.data

import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.feature.notes.liveSession
import cx.lpm.mobile.feature.notes.noteJson
import cx.lpm.mobile.feature.notes.notes
import cx.lpm.mobile.feature.notes.pageReply
import cx.lpm.mobile.feature.notes.settle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The store against a Mac the test answers for itself, replies out of order. */
class NotesStoreTest {
    @Test
    fun `a page is kept only when it answers the request still asked`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.chatDidOpen("p", "c1")
        assertEquals("", socket.sentOf("notesMessages").single().string("beforeId"))
        assertEquals(NotesStore.PAGE_SIZE, socket.sentOf("notesMessages").single().int("limit"))

        // A late page for an older request, then the one asked.
        socket.receive(pageReply("p", "c1", "n9", listOf(noteJson("stale"))))
        t.settle(0)
        assertTrue(notesKey("p", "c1") in t.notes.state.value.messagesLoading)
        val full = (50 downTo 1).map { noteJson("n$it", ts = it.toLong()) }
        socket.receive(pageReply("p", "c1", "", full))
        t.settle(0)
        var s = t.notes.state.value
        assertEquals("n1", s.orderedMessages("p", "c1").first().id)
        assertTrue(s.canLoadMore("p", "c1"))

        t.notes.loadMoreMessages("p", "c1")
        t.notes.loadMoreMessages("p", "c1")
        val older = socket.sentOf("notesMessages").drop(1)
        assertEquals(listOf("n1"), older.map { it.string("beforeId") })
        socket.receive(pageReply("p", "c1", "n1", listOf(noteJson("n0", ts = 0))))
        t.settle(0)
        s = t.notes.state.value
        assertEquals(51, s.orderedMessages("p", "c1").size)
        assertFalse(s.canLoadMore("p", "c1"))
        assertTrue(s.paging.isEmpty())
    }

    @Test
    fun `a page for a chat that closed is dropped`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.chatDidOpen("p", "c1")
        t.notes.chatDidClose("p", "c1")
        socket.receive(pageReply("p", "c1", "", listOf(noteJson("n1"))))
        t.settle(0)
        assertTrue(t.notes.state.value.orderedMessages("p", "c1").isEmpty())
    }

    @Test
    fun `search keeps only the reply to the latest query`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.search.search("p", "mo")
        t.notes.search.search("p", " mock ")
        assertEquals(listOf("mo", "mock"), socket.sentOf("notesSearch").map { it.string("query") })
        socket.receive(searchReply("mo", "old"))
        t.settle(0)
        assertTrue("p" in t.notes.search.state.value.loading)
        socket.receive(searchReply("mock", "new"))
        t.settle(0)
        val s = t.notes.search.state.value
        assertEquals(listOf("new"), s.hits["p"]?.map { it.id })
        assertFalse("p" in s.loading)

        t.notes.search.search("p", "  ")
        assertNull(t.notes.search.state.value.hits["p"])
        assertNull(t.notes.search.state.value.query["p"])
    }

    @Test
    fun `a search the Mac never answers times out`() = runTest {
        val t = liveSession()
        t.connectReady()
        t.notes.search.search("p", "mock")
        t.settle(25_000)
        assertEquals("Search timed out. Try again.", t.notes.search.state.value.error["p"])
    }

    @Test
    fun `a read the connected Mac never answers says it may be waiting on a prompt`() = runTest {
        val t = liveSession()
        t.connectReady()
        t.notes.loadChats("p")
        t.notes.chatDidOpen("p", "c1")
        t.settle(25_000)
        val wait = "No answer from Studio Mac yet. It may be waiting on a prompt on its " +
            "screen, such as Keychain access."
        val s = t.notes.state.value
        assertEquals("$wait Pull to refresh.", s.chatsError["p"])
        assertEquals(wait, s.messagesError[notesKey("p", "c1")])
    }

    @Test
    fun `a read with no link says the Mac couldn't be reached`() = runTest {
        val t = liveSession()
        t.notes.loadChats("p")
        t.notes.chatDidOpen("p", "c1")
        t.settle(25_000)
        val s = t.notes.state.value
        assertEquals("Couldn't reach your Mac. Pull to refresh.", s.chatsError["p"])
        assertEquals("Couldn't load these notes. Try again.", s.messagesError[notesKey("p", "c1")])
    }

    @Test
    fun `an attachment over the cap is refused without asking the Mac`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.attachments.fetch("p", "big", NoteAttachments.BYTE_LIMIT + 1)
        assertTrue(socket.sentOf("notesAttachment").isEmpty())
        assertEquals(
            "This attachment is too large to open on your phone. Open it on your Mac instead.",
            t.notes.attachments.state.value.error["big"]
        )

        t.notes.attachments.fetch("p", "h1", 3)
        t.notes.attachments.fetch("p", "h1", 3)
        assertEquals(1, socket.sentOf("notesAttachment").size)
        socket.receive(
            """{"t":"notesAttachment","project":"p","hash":"h1","ok":true,"data":"YWJj"}"""
        )
        t.settle(0)
        assertEquals("abc", t.notes.attachments.data("h1")?.decodeToString())
        assertTrue("h1" in t.notes.attachments.state.value.cached)

        t.notes.attachments.fetch("p", "h2", 3)
        socket.receive(
            """{"t":"notesAttachment","project":"p","hash":"h2","ok":true,"data":"%%%"}"""
        )
        t.settle(0)
        assertEquals("Couldn't open the attachment.", t.notes.attachments.state.value.error["h2"])
    }

    @Test
    fun `a note over the cap is refused before it's sent`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        val big =
            NoteAttachmentDraft(
                "big.bin",
                "application/octet-stream",
                ByteArray(NoteAttachments.BYTE_LIMIT + 1)
            )
        t.notes.addNote("p", "c1", "", listOf(big))
        val s = t.notes.state.value
        assertTrue(socket.sentOf("notesAddMessage").isEmpty())
        assertEquals(NotesStore.TOO_LARGE, s.sendError[notesKey("p", "c1")])
        assertEquals(1, s.errorTick)

        t.notes.addNote("p", "c1", "  ")
        assertTrue(socket.sentOf("notesAddMessage").isEmpty())
    }

    @Test
    fun `a send that never lands times out and keeps the error`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.addNote("p", "c1", "hello")
        t.notes.addNote("p", "c1", "again")
        assertEquals(1, socket.sentOf("notesAddMessage").size)
        // Keep the link answering its pings, so only the send goes unanswered.
        repeat(6) {
            t.settle(10_000)
            socket.receive("""{"t":"pong"}""")
        }
        t.settle(0)
        val s = t.notes.state.value
        assertTrue(s.sending.isEmpty())
        assertEquals(
            "Sending timed out. Check your Mac and try again.",
            s.sendError[notesKey("p", "c1")]
        )
        t.notes.clearErrors("p", "c1")
        assertNull(t.notes.state.value.sendError[notesKey("p", "c1")])
    }

    @Test
    fun `attachments too big for one frame go as further notes, one after another`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        val mb = 1024 * 1024
        val files = listOf(6, 6, 3).mapIndexed { i, size ->
            NoteAttachmentDraft("f$i.pdf", "application/pdf", ByteArray(size * mb))
        }
        t.notes.addNote("p", "c1", "the specs", files)
        val first = socket.sentOf("notesAddMessage").single()
        assertEquals("the specs", first.string("text"))
        assertEquals(1, first["attachments"]!!.jsonArray.size)
        val key = notesKey("p", "c1")
        socket.receive(
            """{"t":"notesAddMessage","project":"p","chatId":"c1","ok":true,"message":${noteJson(
                "n1"
            )}}"""
        )
        t.settle(0)
        assertEquals(
            NoteSentPart(1, text = true, attachments = 1),
            t.notes.state.value.accepted[key]
        )
        assertTrue(key in t.notes.state.value.sending)
        val second = socket.sentOf("notesAddMessage").last()
        assertEquals("", second.string("text"))
        assertEquals(2, second["attachments"]!!.jsonArray.size)
        socket.receive(
            """{"t":"notesAddMessage","project":"p","chatId":"c1","ok":true,"message":${noteJson(
                "n2"
            )}}"""
        )
        t.settle(0)
        val s = t.notes.state.value
        assertEquals(NoteSentPart(2, text = false, attachments = 2), s.accepted[key])
        assertTrue(s.sending.isEmpty())
        assertEquals(2, socket.sentOf("notesAddMessage").size)
    }

    @Test
    fun `a send cut off by the link keeps the note and says it may not have landed`() = runTest {
        val t = liveSession()
        t.connectReady()
        t.notes.addNote("p", "c1", "hello")
        t.notes.onConnectionReset()
        t.settle(0)
        val s = t.notes.state.value
        assertTrue(s.sending.isEmpty())
        assertNull(s.accepted[notesKey("p", "c1")])
        assertTrue(s.sendError[notesKey("p", "c1")]!!.startsWith("The connection dropped"))
    }

    @Test
    fun `a failed edit keeps the old text and reports it`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.chatDidOpen("p", "c1")
        socket.receive(pageReply("p", "c1", "", listOf(noteJson("n1", text = "old"))))
        t.settle(0)
        t.notes.editNote("p", "n1", "new")
        socket.receive(
            """{"t":"notesEditMessage","project":"p","id":"n1","ok":false,"error":"Locked"}"""
        )
        t.settle(0)
        val s = t.notes.state.value
        assertEquals("old", s.orderedMessages("p", "c1").single().text)
        assertEquals("Locked", s.noteError[notesKey("p", "n1")])
        t.notes.clearErrors("p", "c1")
        assertTrue(t.notes.state.value.noteError.isEmpty())
    }

    @Test
    fun `a reconnect re-asks for what the screen shows`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.screenDidOpen("p")
        t.notes.chatDidOpen("p", "c1")
        t.notes.search.search("p", "mock")
        t.notes.addNote("p", "c1", "hello")
        t.notes.onConnectionReset()
        t.settle(0)
        val s = t.notes.state.value
        assertTrue(s.sending.isEmpty())
        assertEquals(2, socket.sentOf("notesChats").size)
        assertEquals(2, socket.sentOf("notesMessages").size)
        assertEquals(2, socket.sentOf("notesSearch").size)

        t.notes.screenDidClose("p")
        t.notes.chatDidClose("p", "c1")
        t.notes.onConnectionReset()
        t.settle(0)
        assertEquals(2, socket.sentOf("notesChats").size)
    }

    @Test
    fun `a chat pushed over the list keeps the project active as the list goes`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.notes.screenDidOpen("p")
        // The chat appears before the list has finished disappearing.
        t.notes.screenDidOpen("p")
        t.notes.chatDidOpen("p", "c1")
        t.notes.screenDidClose("p")
        t.notes.onConnectionReset()
        t.settle(0)
        // The second open finds the first load in flight; the reconnect asks again.
        assertEquals(2, socket.sentOf("notesChats").size)
        assertEquals(2, socket.sentOf("notesMessages").size)
    }

    private fun searchReply(query: String, id: String) =
        """{"t":"notesSearch","project":"p","query":"$query","ok":true,""" +
            """"hits":[{"id":"$id","chatId":"c1","chatTitle":"General","ts":1,"snippet":"s"}]}"""
}
