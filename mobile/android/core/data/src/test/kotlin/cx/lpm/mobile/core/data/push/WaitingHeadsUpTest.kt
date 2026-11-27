package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.data.prefs.NotificationPrefs
import cx.lpm.mobile.core.data.prefs.setNotificationPrefs
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class WaitingHeadsUpTest {
    private fun TestScope.settle() = testScheduler.runCurrent()

    private val SessionHarness.headsUp: WaitingHeadsUp get() = session.store()

    private fun SessionHarness.banner() = headsUp.banner.value

    private fun entry(pane: String, ts: Long, value: String = "Waiting") =
        """{"key":"claude_code_$pane","value":"$value","paneID":"$pane","timestamp":$ts}"""

    private fun FakeSocket.status(project: String, vararg entries: String) = receive(
        """{"t":"status","project":"$project","status":[${entries.joinToString(",")}],""" +
            """"seen":[]}"""
    )

    /** Linked up, with every project's first status in: nothing waits yet. */
    private fun TestScope.ready(h: SessionHarness, waitingFirst: String? = null): FakeSocket {
        val socket = h.connectReady()
        socket.receive(
            """{"t":"projects","projects":[""" +
                """{"name":"storefront","label":"Storefront","running":true},""" +
                """{"name":"api","running":true},""" +
                """{"name":"api-2","label":"api copy","parentName":"api","running":true}]}"""
        )
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[""" +
                """{"id":"t1","label":"Claude","project":"storefront"},""" +
                """{"id":"t2","label":"Codex","project":"storefront"}]}"""
        )
        if (waitingFirst == null) {
            socket.status("storefront")
        } else {
            socket.status("storefront", entry(waitingFirst, 500))
        }
        socket.status("api")
        socket.status("api-2")
        settle()
        return socket
    }

    @Test
    fun `a project's first status load only records what already waits`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h, waitingFirst = "t1")
        assertNull(h.banner())

        socket.status("storefront", entry("t1", 500))
        settle()
        assertNull(h.banner())

        socket.status("storefront", entry("t1", 500), entry("t2", 900))
        settle()
        assertEquals(listOf("t2"), h.banner()!!.waits.map { it.terminalId })
    }

    @Test
    fun `another agent starting to wait is told once, naming its tab`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        socket.status("storefront", entry("t1", 1_000))
        settle()

        val banner = h.banner()!!
        assertTrue(banner.alert)
        assertEquals("srv-1", banner.serverId)
        val wait = banner.newest
        assertEquals("storefront", wait.project)
        assertEquals("Storefront", wait.projectLabel)
        assertEquals("Claude", wait.terminal)
        assertEquals("claude_code_t1", wait.key)
        assertEquals(1_000L, wait.ts)

        // The same report again (a refresh) is no news; a new one from the same tab is.
        socket.status("storefront", entry("t1", 1_000))
        settle()
        assertEquals(banner, h.banner())
        socket.status("storefront", entry("t1", 2_000))
        settle()
        assertEquals(listOf(2_000L), h.banner()!!.waits.map { it.ts })
    }

    @Test
    fun `a wait the projects list already showed is no news`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        socket.receive(
            """{"t":"projects","projects":[{"name":"storefront","label":"Storefront",""" +
                """"running":true,"statusEntries":[${entry("t1", 1_000)}]}]}"""
        )
        socket.status("storefront", entry("t1", 1_000))
        settle()
        assertNull(h.banner())
    }

    @Test
    fun `the tab on screen gets no banner, and opening a waiting tab takes it out`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        h.headsUp.showTerminal("t1")
        socket.status("storefront", entry("t1", 1_000))
        settle()
        assertNull(h.banner())

        h.headsUp.hideTerminal("t1")
        socket.status("storefront", entry("t1", 1_000), entry("t2", 1_100))
        settle()
        assertEquals(listOf("t2"), h.banner()!!.waits.map { it.terminalId })

        h.headsUp.showTerminal("t2")
        assertNull(h.banner())
        assertEquals("t2", h.headsUp.terminalOnScreen)
        // Another screen leaving doesn't take this one's place.
        h.headsUp.hideTerminal("t1")
        assertEquals("t2", h.headsUp.terminalOnScreen)
    }

    @Test
    fun `the background, the switches and an Off project keep it quiet`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        var ts = 1_000L
        fun waitsOn(project: String, pane: String = "t1"): WaitingBanner? {
            socket.status(project, entry(pane, ts++))
            settle()
            return h.banner()
        }

        h.session.setInForeground(false)
        assertNull(waitsOn("storefront"))
        h.session.setInForeground(true)

        h.prefs.setNotificationPrefs(NotificationPrefs(enabled = false))
        assertNull(waitsOn("storefront"))
        h.prefs.setNotificationPrefs(NotificationPrefs(waiting = false))
        assertNull(waitsOn("storefront"))

        // A copy follows its original's level unless it has its own.
        h.prefs.setNotificationPrefs(NotificationPrefs(projects = mapOf("api" to "off")))
        assertNull(waitsOn("api"))
        assertNull(waitsOn("api-2"))
        h.prefs.setNotificationPrefs(
            NotificationPrefs(projects = mapOf("api" to "off", "api-2" to "waiting"))
        )
        assertEquals("api copy", waitsOn("api-2")!!.newest.projectLabel)
    }

    @Test
    fun `quiet hours keep it quiet unless waiting may come through`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        val allDay = QuietHours(enabled = true, start = 0, end = 0, letWaitingThrough = false)
        h.prefs.setNotificationPrefs(NotificationPrefs(quiet = allDay))
        socket.status("storefront", entry("t1", 1_000))
        settle()
        assertNull(h.banner())

        h.prefs.setNotificationPrefs(
            NotificationPrefs(quiet = allDay.copy(letWaitingThrough = true))
        )
        socket.status("storefront", entry("t1", 1_000), entry("t2", 1_100))
        settle()
        assertNotNull(h.banner())
    }

    @Test
    fun `several waits collapse into one, newest first`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        socket.status("storefront", entry("t1", 1_000))
        socket.status("api", entry("a1", 1_100))
        socket.status("storefront", entry("t1", 1_000), entry("t2", 1_200))
        settle()

        val banner = h.banner()!!
        assertEquals(3, banner.waits.size)
        assertEquals("t2", banner.newest.terminalId)
        // A tab the list doesn't hold goes by its project alone.
        assertEquals(listOf("Storefront · Codex", "api", "Storefront · Claude"), banner.lines)
    }

    @Test
    fun `a wait that ends drops out without a sound`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        socket.status("storefront", entry("t1", 1_000), entry("t2", 1_100))
        settle()
        assertEquals(2, h.banner()!!.waits.size)

        socket.status("storefront", entry("t1", 1_000, value = "Running"), entry("t2", 1_100))
        settle()
        val banner = h.banner()!!
        assertEquals(listOf("t2"), banner.waits.map { it.terminalId })
        assertFalse(banner.alert)

        socket.status("storefront")
        settle()
        assertNull(h.banner())
    }

    @Test
    fun `a dropped link takes the banner away and starts the first loads over`() = runTest {
        val h = SessionHarness(this)
        val socket = ready(h)
        socket.status("storefront", entry("t1", 1_000))
        settle()
        assertNotNull(h.banner())

        h.headsUp.onConnectionReset()
        assertNull(h.banner())
        socket.status("storefront", entry("t1", 1_000), entry("t2", 1_100))
        settle()
        assertNull(h.banner())
    }
}
