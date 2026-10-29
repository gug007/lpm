package cx.lpm.mobile.core.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.push.AgentAnswerAction
import cx.lpm.mobile.core.data.push.AnswerOutcome
import cx.lpm.mobile.core.data.push.PushAlert
import cx.lpm.mobile.core.data.push.PushKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class AnswerNoticesTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    private val notices = AnswerNotices(app)

    private fun alert(actions: List<AgentAnswerAction>) = PushAlert(
        serverId = "srv-1",
        project = "api",
        title = "API",
        body = "Claude — Agent is waiting for you",
        kind = PushKind.Waiting,
        target = "terminal",
        terminalId = "t-1",
        automationId = null,
        statusKey = "claude_code_t-1",
        status = "Waiting",
        ts = 42,
        actions = actions
    )

    private val permission = alert(listOf(AgentAnswerAction.Allow, AgentAnswerAction.Deny))

    @Before
    fun allowNotifications() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        manager.notify(
            "c1",
            AlertExtras.NOTIFICATION_ID,
            app.alertNotification(permission, "c1").build()
        )
    }

    private fun only(): Notification = manager.activeNotifications.single().notification

    private fun body(n: Notification) = n.extras.getCharSequence(Notification.EXTRA_TEXT).toString()

    @Test
    fun anAllowThatWentThroughTakesThePromptAway() {
        notices.show(
            AnswerRequest(permission, "c1", AgentAnswerAction.Allow, null),
            AnswerOutcome.Sent
        )
        assertTrue(manager.activeNotifications.isEmpty())
    }

    @Test
    fun aRefusalSaysWhyAndStillOpensTheTab() {
        notices.show(
            AnswerRequest(permission, "c1", AgentAnswerAction.Deny, null),
            AnswerOutcome.Refused("This prompt was already answered.")
        )
        val n = only()
        assertEquals("API", n.extras.getString(Notification.EXTRA_TITLE))
        assertEquals("Not sent: This prompt was already answered.", body(n))
        assertNull(n.actions)
        val open = shadowOf(n.contentIntent).savedIntent
        assertEquals(PushNotifier.ACTION_OPEN, open.action)
        assertEquals("t-1", open.getStringExtra("terminalId"))
        assertEquals("srv-1", open.getStringExtra("serverId"))
        // Still the alert's own: a withdrawal of its status takes it back too.
        assertEquals("claude_code_t-1", n.extras.getString(AlertExtras.STATUS_KEY))
    }

    @Test
    fun anUnreachableMacIsNamed() {
        val request = AnswerRequest(permission, "c1", AgentAnswerAction.Allow, null)
        notices.show(request, AnswerOutcome.Unreachable("Studio Mac"))
        assertEquals("Not sent: couldn't reach Studio Mac.", body(only()))
        notices.show(request, AnswerOutcome.Unreachable(null))
        assertEquals("Not sent: couldn't reach your Mac.", body(only()))
    }

    @Test
    fun aSentReplyTakesTheAlertAwayToo() {
        val done = alert(listOf(AgentAnswerAction.Reply))
        notices.show(
            AnswerRequest(done, "c1", AgentAnswerAction.Reply, "Ship it"),
            AnswerOutcome.Sent
        )
        assertTrue(manager.activeNotifications.isEmpty())
    }

    @Test
    fun aMacThePhoneNoLongerHasIsSaidSo() {
        notices.show(
            AnswerRequest(permission, "c1", AgentAnswerAction.Allow, null),
            AnswerOutcome.UnknownMac
        )
        assertEquals("Not sent: This Mac isn't on this phone any more.", body(only()))
        assertNull(only().actions)
    }

    @Test
    fun anEmptyReplyPutsTheAlertBackAsItWas() {
        val done = alert(listOf(AgentAnswerAction.Reply))
        notices.restore(AnswerRequest(done, "c1", AgentAnswerAction.Reply, ""))
        val n = only()
        assertEquals("Claude — Agent is waiting for you", body(n))
        assertEquals(
            listOf("Reply", "Review Changes", "Open Tab"),
            n.actions.map {
                it.title.toString()
            }
        )
    }

    @Test
    fun aTappedButtonCarriesItsAlertAndReply() {
        val done = alert(listOf(AgentAnswerAction.Reply))
        val action = app.answerActions(done, "c1").single()
        val intent = Intent(shadowOf(action.actionIntent).savedIntent)
        RemoteInput.addResultsToIntent(
            action.remoteInputs!!,
            intent,
            android.os.Bundle().apply { putCharSequence(AnswerRequest.REPLY_TEXT, "  Ship it \n") }
        )
        val request = AnswerRequest.from(intent)!!
        assertEquals(done, request.alert)
        assertEquals("Ship it", request.answer?.text)
        assertEquals(42L, request.answer?.ts)

        val blank = Intent(shadowOf(action.actionIntent).savedIntent)
        RemoteInput.addResultsToIntent(
            action.remoteInputs!!,
            blank,
            android.os.Bundle().apply { putCharSequence(AnswerRequest.REPLY_TEXT, "   ") }
        )
        assertNull(AnswerRequest.from(blank)!!.answer)
        assertNull(AnswerRequest.from(Intent("other")))
    }
}
