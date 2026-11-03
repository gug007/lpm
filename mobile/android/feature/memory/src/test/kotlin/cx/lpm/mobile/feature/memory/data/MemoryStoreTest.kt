package cx.lpm.mobile.feature.memory.data

import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.feature.memory.liveSession
import cx.lpm.mobile.feature.memory.memory
import cx.lpm.mobile.feature.memory.memoryReply
import cx.lpm.mobile.feature.memory.settle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MemoryStoreTest {
    @Test
    fun `a second load while one is in flight sends nothing`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.load("storefront")
        t.memory.load("storefront")
        assertEquals(1, socket.sentOf("memory").size)
    }

    @Test
    fun `replies are matched by the project and session they echo`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.load("storefront")
        t.memory.load("api-gateway")
        t.memory.openSession("storefront", "a")
        t.memory.openSession("storefront", "b")
        socket.receive(memoryReply("api-gateway", names = arrayOf("gw")))
        socket.receive(
            """{"t":"memorySession","project":"storefront","name":"b","ok":true,""" +
                """"title":"B","content":"# B"}"""
        )
        t.settle(0)
        val s = t.memory.state.value
        assertEquals(setOf("storefront"), s.listLoading)
        assertEquals(listOf("gw"), s.sessions("api-gateway").map { it.name })
        assertTrue(s.sessions("storefront").isEmpty())
        assertEquals(setOf(memoryKey("storefront", "a")), s.documentLoading)
        assertEquals("# B", s.document("storefront", "b")?.content)
        assertNull(s.document("storefront", "a"))
    }

    @Test
    fun `a copy reads its original's folder and shows it as shared`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.screenDidOpen("storefront-2")
        socket.receive(memoryReply("storefront-2", owner = "storefront", names = arrayOf("x")))
        t.settle(0)
        val s = t.memory.state.value
        assertEquals("storefront", s.owner("storefront-2"))
        assertTrue(s.isShared("storefront-2"))

        // The original's folder changed: the copy showing it refreshes too.
        val before = socket.sentOf("memory").size
        t.memory.changed("storefront")
        t.settle(500)
        val asked = socket.sentOf("memory").drop(before).map { it.string("project") }
        assertEquals(listOf("storefront-2"), asked)
    }

    @Test
    fun `a Mac that never answers times every request out with its own message`() = runTest {
        val t = liveSession()
        t.connectReady()
        t.memory.load("storefront")
        t.memory.openSession("storefront", "a")
        t.memory.save("storefront", "b", "text", baseline = "")
        t.memory.delete("storefront", "c")
        t.settle(25_000)
        var s = t.memory.state.value
        assertEquals("Couldn't reach your Mac. Pull to refresh.", s.listError["storefront"])
        assertEquals(
            "Couldn't open this session. Try again.",
            s.documentError[memoryKey("storefront", "a")]
        )
        assertTrue(s.saving.isNotEmpty())
        t.settle(5_000)
        s = t.memory.state.value
        assertEquals(
            "Saving timed out. Check your Mac and try again.",
            s.saveError[memoryKey("storefront", "b")]
        )
        assertEquals("Deleting timed out. Try again.", s.deleteError[memoryKey("storefront", "c")])
        assertEquals(Haptic.Error, s.feedback?.haptic)
        assertTrue(s.saving.isEmpty() && s.deleting.isEmpty() && s.listLoading.isEmpty())
    }

    @Test
    fun `a failed save keeps the Mac's reason and plays the error once`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.save("storefront", "b", "text", baseline = "old")
        socket.receive(
            """{"t":"memorySave","project":"storefront","name":"b","ok":false,"error":"Disk full"}"""
        )
        t.settle(0)
        val s = t.memory.state.value
        assertEquals("Disk full", s.saveError[memoryKey("storefront", "b")])
        assertEquals(1, s.feedback?.seq)
        t.memory.consumeSaveError("storefront", "b")
        assertNull(t.memory.state.value.saveError[memoryKey("storefront", "b")])
    }

    @Test
    fun `a failed delete is reported, not applied`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.delete("storefront", "b")
        socket.receive(
            """{"t":"memoryDelete","project":"storefront","name":"b","ok":false,"error":"Nope"}"""
        )
        t.settle(0)
        val s = t.memory.state.value
        assertEquals("Nope", s.deleteError[memoryKey("storefront", "b")])
        assertNull(s.deletedTick[memoryKey("storefront", "b")])
    }

    @Test
    fun `a dropped connection re-asks for what the screen shows`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.screenDidOpen("storefront")
        t.memory.openSession("storefront", "a")
        t.memory.save("storefront", "a", "x", baseline = "y")
        t.memory.onConnectionReset()
        val s = t.memory.state.value
        assertTrue(s.saving.isEmpty())
        assertEquals(setOf("storefront"), s.listLoading)
        assertEquals(2, socket.sentOf("memory").size)
        assertEquals(2, socket.sentOf("memorySession").size)
    }

    @Test
    fun `a pushed session keeps the project active after the list under it closes`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.screenDidOpen("storefront")
        t.memory.screenDidOpen("storefront")
        t.memory.openSession("storefront", "a")
        t.memory.screenDidClose("storefront")
        t.memory.onConnectionReset()
        assertEquals(2, socket.sentOf("memorySession").size)

        t.memory.sessionDidClose("storefront", "a")
        t.memory.screenDidClose("storefront")
        t.memory.onConnectionReset()
        assertEquals(2, socket.sentOf("memory").size)
        assertEquals(2, socket.sentOf("memorySession").size)
    }

    @Test
    fun `a closed screen isn't replayed after a reconnect`() = runTest {
        val t = liveSession()
        val socket = t.connectReady()
        t.memory.screenDidOpen("storefront")
        socket.receive(memoryReply("storefront", names = arrayOf("a")))
        t.memory.screenDidClose("storefront")
        t.memory.onConnectionReset()
        assertEquals(1, socket.sentOf("memory").size)
    }
}
