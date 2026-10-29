package cx.lpm.mobile.core.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ProcessLifecycleOwner
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.widget.AgentWidgetStore
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.testing.TestSession
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class PushNotifierTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    private val waiting =
        """{"serverId":"srv-1","project":"api","projectLabel":"API","target":"terminal",""" +
            """"terminal":"Claude","terminalId":"t-1","status":"Waiting","ts":1,"key":"k1"}"""

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

    private suspend fun TestScope.notifier(): Pair<PushNotifier, TestSession> {
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
        return notifier to t
    }

    private fun shown(): List<Notification> = manager.activeNotifications.map { it.notification }

    @Test
    fun anAlertIsPostedOnItsKindsChannelAndOpensItsTerminal() = runTest {
        val (notifier, t) = notifier()
        notifier.handle(
            mapOf("blob" to seal(waiting, t.credentials.loadPushKey()!!), "collapseId" to "c1")
        )

        val sbn = manager.activeNotifications.single()
        val n = sbn.notification
        assertEquals("c1", sbn.tag)
        assertEquals("agent-waiting", n.channelId)
        assertEquals("API", n.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(
            "Claude — Agent is waiting for you",
            n.extras.getString(Notification.EXTRA_TEXT)
        )
        val open = shadowOf(n.contentIntent).savedIntent
        assertEquals(PushNotifier.ACTION_OPEN, open.action)
        assertEquals("api", open.getStringExtra("project"))
        assertEquals("terminal", open.getStringExtra("target"))
        assertEquals("t-1", open.getStringExtra("terminalId"))
        assertEquals("srv-1", open.getStringExtra("serverId"))
        val channel = manager.getNotificationChannel("agent-waiting")
        assertEquals("agents", channel.group)
        assertEquals(NotificationManager.IMPORTANCE_HIGH, channel.importance)
        assertEquals("automations", manager.getNotificationChannel("automation-done").group)
    }

    @Test
    fun aWithdrawalTakesTheNotificationBack() = runTest {
        val (notifier, t) = notifier()
        val key = t.credentials.loadPushKey()!!
        notifier.handle(mapOf("blob" to seal(waiting, key), "collapseId" to "c1"))
        notifier.handle(
            mapOf(
                "blob" to
                    seal("""{"serverId":"srv-2","clear":[{"project":"api","key":"k1"}]}""", key),
                "type" to "background"
            )
        )
        assertEquals(1, shown().size)
        notifier.handle(
            mapOf(
                "blob" to
                    seal("""{"serverId":"srv-1","clear":[{"project":"api","key":"k1"}]}""", key),
                "type" to "background"
            )
        )
        assertTrue(shown().isEmpty())
    }

    @Test
    fun aStatusThatMovedOnIsWithdrawnWhenTheListArrives() = runTest {
        val (notifier, t) = notifier()
        notifier.handle(mapOf("blob" to seal(waiting, t.credentials.loadPushKey()!!)))
        val running = Project.parse(
            Json.parseToJsonElement(
                """{"name":"api","statusEntries":[{"key":"k1","value":"Running"}]}"""
            ) as JsonObject
        )
        // A project the list doesn't carry is left alone.
        notifier.reconcile(emptyList(), "srv-1")
        assertEquals(1, shown().size)
        notifier.reconcile(listOf(running), "srv-1")
        assertTrue(shown().isEmpty())
    }

    @Test
    fun theOpenAppLeavesItsLiveMacsNewsToTheScreen() = runTest {
        val (notifier, t) = notifier()
        t.connectReady()
        (ProcessLifecycleOwner.get().lifecycle as LifecycleRegistry).currentState =
            Lifecycle.State.RESUMED
        try {
            val key = t.credentials.loadPushKey()!!
            notifier.handle(mapOf("blob" to seal(waiting, key)))
            assertTrue(shown().isEmpty())
            // Another Mac's news is shown even with the app open.
            notifier.handle(mapOf("blob" to seal(waiting.replace("srv-1", "srv-2"), key)))
            assertEquals(1, shown().size)
        } finally {
            (ProcessLifecycleOwner.get().lifecycle as LifecycleRegistry).currentState =
                Lifecycle.State.CREATED
        }
    }

    private fun alert(actions: String) = waiting.replace(
        "\"key\":\"k1\"}",
        "\"key\":\"k1\",\"actions\":$actions}"
    )

    @Test
    fun aPermissionPromptOffersAllowAndDenyBehindTheLock() = runTest {
        val (notifier, t) = notifier()
        notifier.handle(
            mapOf(
                "blob" to seal(alert("""["allow","deny"]"""), t.credentials.loadPushKey()!!),
                "collapseId" to "c1"
            )
        )

        val actions = manager.activeNotifications.single().notification.actions
        assertEquals(listOf("Allow", "Deny"), actions.map { it.title.toString() })
        assertTrue(actions.all { it.isAuthenticationRequired })
        assertTrue(actions.all { it.remoteInputs == null })
        val deny = shadowOf(actions[1].actionIntent)
        assertEquals(AnswerReceiver::class.java.name, deny.savedIntent.component?.className)
        val request = AnswerRequest.from(deny.savedIntent)!!
        assertEquals("c1", request.tag)
        assertEquals("deny", request.answer?.action?.wire)
        assertEquals("t-1", request.answer?.terminalId)
        assertEquals(1L, request.answer?.ts)
        assertEquals("API", request.alert.title)
    }

    @Test
    fun aFinishedAgentOffersAReplyField() = runTest {
        val (notifier, t) = notifier()
        val done = alert("""["reply"]""").replace("Waiting", "Done")
        notifier.handle(mapOf("blob" to seal(done, t.credentials.loadPushKey()!!)))

        val actions = manager.activeNotifications.single().notification.actions
        assertEquals(
            listOf("Reply", "Review Changes", "Open Tab"),
            actions.map {
                it.title.toString()
            }
        )
        val review = shadowOf(actions[1].actionIntent).savedIntent
        assertEquals(PushNotifier.ACTION_OPEN, review.action)
        assertEquals("changes", review.getStringExtra("target"))
        val reply = actions.first()
        assertEquals("Reply", reply.title.toString())
        assertTrue(reply.isAuthenticationRequired)
        assertEquals("Reply…", reply.remoteInputs.single().label.toString())
        assertEquals(Notification.Action.SEMANTIC_ACTION_REPLY, reply.semanticAction)
    }

    @Test
    fun anAlertWithoutAnswersHasNoButtons() = runTest {
        val (notifier, t) = notifier()
        notifier.handle(mapOf("blob" to seal(waiting, t.credentials.loadPushKey()!!)))
        assertNull(manager.activeNotifications.single().notification.actions)
    }

    private val working =
        """{"serverId":"srv-1","ts":1,"live":true,"waiting":0,"working":1,"agents":[""" +
            """{"project":"api","projectLabel":"API","terminal":"Claude","terminalId":"t-1",""" +
            """"key":"claude_code_t-1","state":"Running","since":2000,"turnStart":1000}]}"""

    @Test
    fun theMacsLiveUpdateIsTheAgentsAtWorkCard() = runTest {
        val (notifier, t) = notifier()
        t.savedMac(name = "MacBook Pro")
        val key = t.credentials.loadPushKey()!!
        notifier.handle(mapOf("blob" to seal(working, key), "type" to "liveactivity"))

        val card = manager.activeNotifications.single()
        assertEquals("srv-1", card.tag)
        assertEquals("agents-live", card.notification.channelId)
        assertEquals("MacBook Pro", card.notification.extras.getString(Notification.EXTRA_TITLE))
        assertTrue(
            card.notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString()
                .startsWith("Claude · ")
        )
        assertTrue(card.isOngoing)
        val channel = manager.getNotificationChannel("agents-live")
        assertEquals(NotificationManager.IMPORTANCE_LOW, channel.importance)
        assertEquals("agents", channel.group)

        notifier.handle(
            mapOf("blob" to seal(working, key), "type" to "liveactivity", "event" to "end")
        )
        val done = manager.activeNotifications.single()
        assertEquals("MacBook Pro", done.notification.extras.getString(Notification.EXTRA_TITLE))
        assertFalse(done.isOngoing)
        assertEquals(15 * 60 * 1000L, done.notification.timeoutAfter)
        // A withdrawal never touches the card.
        notifier.handle(
            mapOf(
                "blob" to
                    seal(
                        """{"serverId":"srv-1","clear":[{"project":"api","key":"claude_code_t-1"}]}""",
                        key
                    ),
                "type" to "background"
            )
        )
        assertEquals(1, shown().size)
    }

    @Test
    fun garbageAndForeignBlobsShowNothing() = runTest {
        val (notifier, _) = notifier()
        notifier.handle(mapOf("blob" to "not a blob"))
        notifier.handle(mapOf("blob" to seal(waiting, ByteArray(32))))
        notifier.handle(emptyMap())
        assertTrue(shown().isEmpty())
    }
}
