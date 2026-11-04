package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.data.dictation.DictationFailure
import cx.lpm.mobile.core.data.dictation.DictationPhase
import cx.lpm.mobile.core.data.dictation.DictationState
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ComposerMicSeatTest {
    private fun state(
        text: String = "",
        attachments: List<Attachment> = emptyList(),
        transforming: Boolean = false,
        dictation: DictationState = DictationState()
    ) = ComposerUiState(
        composer = ComposerState(
            tabs = listOf(ComposerTab(text = text, attachments = attachments)),
            transforming = transforming
        ),
        dictation = dictation,
        dictationOwner = "composer:t1"
    )

    private fun attachment(status: Attachment.Status) =
        Attachment(Attachment.Kind.Image, "a.png", "image/png", status = status)

    @Test
    fun `with nothing to send the mic takes Send's seat`() {
        assertTrue(state().micInSendSeat(enabled = true))
        assertFalse(state().micBesideSend(enabled = true))
    }

    @Test
    fun `text moves the mic beside Send`() {
        val s = state(text = "hello")
        assertFalse(s.micInSendSeat(enabled = true))
        assertTrue(s.micBesideSend(enabled = true))
    }

    @Test
    fun `an uploaded attachment counts as something to send`() {
        val s = state(attachments = listOf(attachment(Attachment.Status.Uploaded("/tmp/a.png"))))
        assertFalse(s.micInSendSeat(enabled = true))
        assertTrue(s.micBesideSend(enabled = true))
    }

    @Test
    fun `a waiting Send keeps its seat during an upload`() {
        val s = state(attachments = listOf(attachment(Attachment.Status.Uploading)))
        assertFalse(s.canSend)
        assertFalse(s.micInSendSeat(enabled = true))
        assertTrue(s.micBesideSend(enabled = true))
    }

    @Test
    fun `a composer that's off has no mic`() {
        assertFalse(state().micInSendSeat(enabled = false))
        assertFalse(state(text = "hello").micBesideSend(enabled = false))
    }

    @Test
    fun `a rewrite keeps the mic out of Send's seat`() {
        assertFalse(state(transforming = true).micInSendSeat(enabled = true))
    }

    @Test
    fun `the recorder replaces the mic beside Send, for its own composer only`() {
        val here = DictationState(DictationPhase.Recording, "composer:t1", startedAt = 0)
        val elsewhere = DictationState(DictationPhase.Recording, "composer:t2", startedAt = 0)
        assertTrue(state(text = "hello", dictation = here).takeActive)
        assertFalse(state(text = "hello", dictation = here).micBesideSend(enabled = true))
        assertFalse(state(text = "hello", dictation = elsewhere).takeActive)
        assertTrue(state(text = "hello", dictation = elsewhere).micBesideSend(enabled = true))
    }

    @Test
    fun `a failed take keeps the strip but gives Send back`() {
        val failed = DictationState(
            DictationPhase.Failed(DictationFailure.NoSpeech),
            "composer:t1"
        )
        val s = state(text = "hello", dictation = failed)
        assertTrue(s.stripShown)
        assertFalse(s.takeActive)
        assertFalse(s.micBesideSend(enabled = true))
    }
}
