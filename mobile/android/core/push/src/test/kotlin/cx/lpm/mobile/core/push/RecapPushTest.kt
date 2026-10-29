package cx.lpm.mobile.core.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.push.NotificationOpenTarget
import cx.lpm.mobile.core.data.widget.AgentWidgetStore
import cx.lpm.mobile.core.testing.TestSession
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/** Monday's weekly recap push, from the sealed blob to the notification and its tap. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class RecapPushTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private fun recap(serverId: String, week: String = "2026-10-12") =
        """{"serverId":"$serverId","target":"recap","week":"$week",""" +
            """"title":"Your week in lpm is ready",""" +
            """"body":"31h 20m of agents working for you, 214 prompts","ts":1,""" +
            """"key":"recap:$week"}"""

    @Before
    fun allowNotifications() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun seal(plain: String, key: ByteArray): String {
        val nonce = ByteArray(12) { it.toByte() }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
        return Base64.getEncoder().encodeToString(nonce + cipher.doFinal(plain.encodeToByteArray()))
    }

    private suspend fun TestScope.notifier(): Pair<PushNotifier, ByteArray> {
        val t = TestSession(this)
        t.credentials.load()
        t.credentials.loadOrCreatePushKey()
        t.prefs.load()
        val notifier = PushNotifier(
            app,
            t.credentials,
            t.session,
            AgentWidgetStore(app) {},
            LiveNotifier(app, t.prefs, t.macStore),
            t.prefs
        )
        notifier.createChannels()
        return notifier to t.credentials.loadPushKey()!!
    }

    @Test
    fun theRecapIsShownAsGivenOnItsOwnChannelAndOpensThatMacsRecap() = runTest {
        val (notifier, key) = notifier()
        notifier.handle(mapOf("blob" to seal(recap("srv-1"), key)))

        val sbn = manager.activeNotifications.single()
        val n = sbn.notification
        assertEquals("srv-1|recap:2026-10-12", sbn.tag)
        assertEquals("weekly-recap", n.channelId)
        assertEquals("Your week in lpm is ready", n.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(
            "31h 20m of agents working for you, 214 prompts",
            n.extras.getString(Notification.EXTRA_TEXT)
        )
        val open = shadowOf(n.contentIntent).savedIntent
        assertEquals(PushNotifier.ACTION_OPEN, open.action)
        assertEquals(
            NotificationOpenTarget("srv-1", "", NotificationOpenTarget.Kind.Recap, null),
            NotificationOpenTarget.from(open::getStringExtra)
        )
        val channel = manager.getNotificationChannel("weekly-recap")
        assertEquals("Weekly recap", channel.name)
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT, channel.importance)
        assertNull(channel.group)
    }

    @Test
    fun eachMacSendsItsOwnAndAResendReplacesIt() = runTest {
        val (notifier, key) = notifier()
        notifier.handle(mapOf("blob" to seal(recap("srv-1"), key)))
        notifier.handle(mapOf("blob" to seal(recap("srv-1"), key)))
        notifier.handle(mapOf("blob" to seal(recap("srv-2"), key)))
        assertEquals(
            setOf("srv-1|recap:2026-10-12", "srv-2|recap:2026-10-12"),
            manager.activeNotifications.map { it.tag }.toSet()
        )
        // A withdrawal of agent statuses never touches it.
        notifier.handle(
            mapOf(
                "blob" to seal(
                    """{"serverId":"srv-1","clear":[{"project":"api","key":"recap:2026-10-12"}]}""",
                    key
                ),
                "type" to "background"
            )
        )
        notifier.reconcile(emptyList(), "srv-1")
        assertEquals(2, manager.activeNotifications.size)
    }
}
