package cx.lpm.mobile.core.data.dictation

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer

private const val FINISH_TIMEOUT_MS = 4_000L
private const val RETRY_MS = 250L

// The range onRmsChanged reports: about -2 dB in silence to 10 dB for close speech.
private const val QUIET_DB = -2f
private const val LOUD_DB = 10f

/**
 * The phone's speech recognizer, so the mic works with every computer. It stops by
 * itself at a pause, so listening restarts until the take is stopped.
 */
internal class SpeechDictationEngine(private val context: Context) : DictationEngine {
    private val main = Handler(Looper.getMainLooper())
    private val words = DictationWords()
    private var recognizer: SpeechRecognizer? = null
    private var heard: ((String) -> Unit)? = null
    private var finished: ((DictationResult) -> Unit)? = null
    private var meter: DictationMeter? = null
    private var stopping = false

    override fun start(
        meter: DictationMeter,
        heard: (String) -> Unit,
        finished: (DictationResult) -> Unit
    ): DictationFailure? {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) return DictationFailure.Unavailable
        this.meter = meter
        this.heard = heard
        this.finished = finished
        recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
            setRecognitionListener(listener)
        }
        listen()
        return null
    }

    override fun stop() {
        if (finished == null) return
        stopping = true
        recognizer?.stopListening()
        main.postDelayed(::finish, FINISH_TIMEOUT_MS)
    }

    override fun cancel() {
        heard = null
        finished = null
        release()
    }

    private fun listen() {
        recognizer?.startListening(
            Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM
                )
                .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
        )
    }

    private fun finish(failure: DictationFailure = DictationFailure.NoSpeech) {
        val done = finished ?: return
        heard = null
        finished = null
        release()
        val text = words.text
        done(if (text.isEmpty()) DictationResult.Failed(failure) else DictationResult.Words(text))
    }

    private fun release() {
        main.removeCallbacksAndMessages(null)
        recognizer?.setRecognitionListener(null)
        recognizer?.destroy()
        recognizer = null
    }

    private val listener = object : RecognitionListener {
        override fun onRmsChanged(rmsdB: Float) {
            meter?.level = ((rmsdB - QUIET_DB) / (LOUD_DB - QUIET_DB)).coerceIn(0f, 1f)
        }

        override fun onPartialResults(partialResults: Bundle?) {
            words.hear(partialResults.best().orEmpty())
            heard?.invoke(words.text)
        }

        override fun onResults(results: Bundle?) {
            words.settle(results.best())
            heard?.invoke(words.text)
            if (stopping) finish() else main.post(::listen)
        }

        override fun onError(error: Int) {
            words.settle(null)
            when {
                stopping -> finish()

                error == SpeechRecognizer.ERROR_NO_MATCH ||
                    error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> main.post(::listen)

                error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ->
                    main.postDelayed(::listen, RETRY_MS)

                error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS ->
                    finish(DictationFailure.Denied)

                else -> finish(DictationFailure.Unavailable)
            }
        }

        override fun onReadyForSpeech(params: Bundle?) = Unit

        override fun onBeginningOfSpeech() = Unit

        override fun onBufferReceived(buffer: ByteArray?) = Unit

        override fun onEndOfSpeech() = Unit

        override fun onEvent(eventType: Int, params: Bundle?) = Unit
    }

    private fun Bundle?.best(): String? =
        this?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
}
