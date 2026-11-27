package cx.lpm.mobile.core.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.push.PushKind
import cx.lpm.mobile.core.data.push.WaitingHeadsUp
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.TestSession
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class WaitingHeadsUpNotifierTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    @Before
    fun allowNotifications() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun entry(pane: String, ts: Long) =
        """{"key":"claude_code_$pane","value":"Waiting","paneID":"$pane","timestamp":$ts}"""

    private fun FakeSocket.status(vararg entries: String) = receive(
        """{"t":"status","project":"storefront","status":[${entries.joinToString(",")}],""" +
            """"seen":[]}"""
    )

    private fun TestScope.linked(): FakeSocket {
        val t = TestSession(this, setOf(SessionStore.Factory(::WaitingHeadsUp)))
        val socket = t.connectReady()
        socket.receive(
            """{"t":"projects","projects":[""" +
                """{"name":"storefront","label":"Storefront","running":true}]}"""
        )
        socket.receive(
            """{"t":"terminals","project":"storefront","terminals":[""" +
                """{"id":"t1","label":"Claude","project":"storefront"}]}"""
        )
        socket.status()
        manager.createNotificationChannel(
            NotificationChannel(PushKind.Waiting.channelId, "Waiting", PushKind.Waiting.importance)
        )
        WaitingHeadsUpNotifier(app, t.session, backgroundScope).start()
        t.scheduler.runCurrent()
        return socket
    }

    private fun shown(): Notification? = manager.activeNotifications.singleOrNull {
        it.tag == WaitingHeadsUpNotifier.TAG
    }?.notification

    private fun Notification.title() = extras.getString(Notification.EXTRA_TITLE)

    private fun Notification.body() = extras.getCharSequence(Notification.EXTRA_TEXT).toString()

    @Test
    fun anotherAgentWaitingPopsUpAndOpensItsTab() = runTest {
        val socket = linked()
        socket.status(entry("t1", 1_000))
        testScheduler.runCurrent()

        val n = shown()!!
        assertEquals("agent-waiting", n.channelId)
        assertEquals("Storefront", n.title())
        assertEquals("Claude needs you", n.body())
        assertNull(n.actions)
        assertNotEquals(NotificationCompat.GROUP_KEY_SILENT, n.group)
        val open = shadowOf(n.contentIntent).savedIntent
        assertEquals(PushNotifier.ACTION_OPEN, open.action)
        assertEquals("storefront", open.getStringExtra("project"))
        assertEquals("terminal", open.getStringExtra("target"))
        assertEquals("t1", open.getStringExtra("terminalId"))
        assertEquals("srv-1", open.getStringExtra("serverId"))
        // What the reconcile matches to withdraw it once the wait ends.
        assertEquals("claude_code_t1", n.extras.getString(AlertExtras.STATUS_KEY))
        assertEquals("Waiting", n.extras.getString(AlertExtras.STATUS))
    }

    @Test
    fun severalCollapseIntoOneAndAnEndedWaitDropsOutQuietly() = runTest {
        val socket = linked()
        socket.status(entry("t1", 1_000))
        socket.status(entry("t1", 1_000), entry("t2", 1_100))
        testScheduler.runCurrent()

        var n = shown()!!
        assertEquals("2 agents need you", n.title())
        assertEquals("Storefront, Storefront · Claude", n.body())
        assertEquals("t2", shadowOf(n.contentIntent).savedIntent.getStringExtra("terminalId"))

        socket.status(entry("t2", 1_100))
        testScheduler.runCurrent()
        n = shown()!!
        assertEquals("Storefront", n.title())
        assertEquals("An agent needs you", n.body())
        assertEquals(NotificationCompat.GROUP_KEY_SILENT, n.group)

        socket.status()
        testScheduler.runCurrent()
        assertTrue(manager.activeNotifications.none { it.tag == WaitingHeadsUpNotifier.TAG })
    }
}
