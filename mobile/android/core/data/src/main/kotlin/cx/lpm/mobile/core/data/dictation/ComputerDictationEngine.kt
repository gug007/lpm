package cx.lpm.mobile.core.data.dictation

import cx.lpm.mobile.core.model.DictationEvent
import cx.lpm.mobile.core.protocol.Wire
import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// Past Stop the Mac is silent while it transcribes, and a long take on a slow model
// takes minutes. This only ends a wait for an answer that was lost.
private const val ANSWER_TIMEOUT_MS = 300_000L

/**
 * A take in the Mac's own VoiceToText: the phone streams what it hears and the model
 * picked there turns it into text, as it does for the desktop's mic. [post] runs a
 * block later on the main thread, never inline, which is what keeps Stop behind the
 * audio already on its way there.
 */
internal class ComputerDictationEngine(
    private val send: (String) -> Unit,
    private val post: (() -> Unit) -> Unit,
    private val scope: CoroutineScope,
    private val microphone: DictationMicrophone
) : DictationEngine {
    private val id = UUID.randomUUID().toString()
    private var words = ""
    private var heard: ((String) -> Unit)? = null
    private var finished: ((DictationResult) -> Unit)? = null
    private var watchdog: Job? = null
    private val stopping get() = watchdog != null

    override fun start(
        meter: DictationMeter,
        heard: (String) -> Unit,
        finished: (DictationResult) -> Unit
    ): DictationFailure? {
        send(Wire.dictateStart(id))
        val opened = microphone.open(meter) { pcm -> post { sendAudio(pcm) } }
        if (!opened) {
            send(Wire.dictateCancel(id))
            return DictationFailure.Unavailable
        }
        this.heard = heard
        this.finished = finished
        return null
    }

    override fun stop() {
        if (finished == null || stopping) return
        microphone.close()
        post { if (finished != null) send(Wire.dictateStop(id)) }
        armWatchdog()
    }

    override fun cancel() {
        if (finished == null) return
        heard = null
        finished = null
        watchdog?.cancel()
        microphone.close()
        send(Wire.dictateCancel(id))
    }

    fun apply(event: DictationEvent) {
        if (event.id != id || finished == null) return
        if (stopping) armWatchdog()
        when (event.kind) {
            "partial" -> {
                words = event.text
                heard?.invoke(words)
            }

            "transcript" -> finish(DictationResult.Words(event.text))

            "error" -> finish(DictationResult.Failed(event.failure))
        }
    }

    /** The Mac cancels the take when the socket closes, so there's no more to come. */
    fun linkLost() {
        finish(DictationResult.Failed(DictationFailure.Computer(LINK_LOST)))
    }

    private fun sendAudio(pcm: String) {
        if (finished != null) send(Wire.dictateAudio(id, pcm))
    }

    // Words a live model already showed are better kept than lost to a failure.
    private fun finish(result: DictationResult) {
        val done = finished ?: return
        finished = null
        heard = null
        watchdog?.cancel()
        microphone.close()
        val keep = result is DictationResult.Failed && words.isNotEmpty()
        done(if (keep) DictationResult.Words(words) else result)
    }

    private fun armWatchdog() {
        watchdog?.cancel()
        watchdog = scope.launch {
            delay(ANSWER_TIMEOUT_MS)
            finish(DictationResult.Failed(DictationFailure.Computer(NO_ANSWER)))
        }
    }

    private val DictationEvent.failure: DictationFailure
        get() = if (code == "too_short" || code == "no_speech") {
            DictationFailure.NoSpeech
        } else {
            DictationFailure.Computer(message)
        }

    private companion object {
        const val LINK_LOST = "Lost the connection to your Mac."
        const val NO_ANSWER = "Your Mac didn't send the words back."
    }
}
