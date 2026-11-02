package cx.lpm.mobile.core.push

import android.Manifest
import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.graphics.Typeface
import android.os.Bundle
import android.text.Spanned
import android.text.style.StyleSpan
import android.text.style.TypefaceSpan
import androidx.test.core.app.ApplicationProvider
import cx.lpm.mobile.core.data.push.AgentAnswerAction
import cx.lpm.mobile.core.data.push.PushAlert
import cx.lpm.mobile.core.data.push.PushChangedFile
import cx.lpm.mobile.core.data.push.PushKind
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

@RunWith(RobolectricTestRunner::class)
class AnswerTextTest {
    private val app: Application = ApplicationProvider.getApplicationContext()

    private val answer = """
        Done — checkout is now a two-step flow:

        - **`lib/payments.ts`** validates the card
          1. see [the docs](https://example.com)
        ---
        ```ts
        const step = "shipping"
        ```

        ## Next
        All *23* tests pass. Want me to update the cart badge?
    """.trimIndent()

    private val done = PushAlert(
        serverId = "srv-1",
        project = "storefront",
        title = "storefront",
        body = "Claude — Agent finished · 4 files, +52 −5",
        kind = PushKind.Done,
        target = "terminal",
        terminalId = "t-1",
        automationId = null,
        statusKey = "claude_code_t-1",
        status = "Done",
        ts = 42,
        actions = listOf(AgentAnswerAction.Reply),
        summary = "Want me to update the cart badge?",
        answer = answer,
        files = listOf(
            PushChangedFile("lib/payments.ts", 31, 2),
            PushChangedFile("README.md", 0, 4)
        ),
        changedFiles = 4
    )

    private fun styled(text: CharSequence, span: Class<*>, matches: (Any) -> Boolean = { true }) =
        (text as Spanned).getSpans(0, text.length, span).filter(matches)
            .map { text.subSequence(text.getSpanStart(it), text.getSpanEnd(it)).toString() }

    private fun bold(span: Any) = (span as StyleSpan).style == Typeface.BOLD

    @Test
    fun theAnswerReadsAsTextWithItsMarkdownDrawn() {
        val text = answerText(answer)
        assertEquals(
            """
                Done — checkout is now a two-step flow:
                • lib/payments.ts validates the card
                  1. see the docs
                const step = "shipping"
                Next
                All 23 tests pass. Want me to update the cart badge?
            """.trimIndent(),
            text.toString()
        )
        assertEquals(
            listOf("lib/payments.ts", "const step = \"shipping\""),
            styled(text, TypefaceSpan::class.java)
        )
        assertEquals(listOf("lib/payments.ts", "Next"), styled(text, StyleSpan::class.java, ::bold))
        assertEquals(listOf("23"), styled(text, StyleSpan::class.java) { !bold(it) })
    }

    @Test
    fun aFinishShowsItsAnswerAndTheFilesItChanged() {
        assertEquals(
            "Claude — Agent finished · 4 files, +52 −5\n" + answerText(answer) +
                "\n\npayments.ts  lib  +31 −2\nREADME.md  −4\n2 more files",
            app.expandedText(done, done.body).toString()
        )
    }

    @Test
    fun anOlderMacsClosingLineStandsInForTheAnswer() {
        val older = done.copy(answer = null, files = emptyList(), changedFiles = 0)
        assertEquals(
            "Claude — Agent finished · 4 files, +52 −5\nWant me to update the cart badge?",
            app.expandedText(older, older.body).toString()
        )
    }

    @Test
    fun theAnswerOutlivesARepost() {
        val bundle = Bundle(done.extras())
        assertEquals(done, bundle.toAlert())

        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
        val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify("d1", AlertExtras.NOTIFICATION_ID, app.alertNotification(done, "d1").build())
        val shown = manager.activeNotifications.single().notification
        assertEquals(
            app.expandedText(done, done.body).toString(),
            shown.extras.getCharSequence(Notification.EXTRA_BIG_TEXT).toString()
        )
    }
}
