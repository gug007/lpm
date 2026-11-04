package cx.lpm.mobile.core.data.dictation

import android.os.Handler
import android.os.Looper
import kotlin.random.Random

private const val LEVEL_STEP_MS = 70L
private const val TRANSCRIBING_MS = 600L
private const val WORD_STEP_MS = 260L
private const val LOW_LEVEL = 0.2f
private const val LEVEL_SPAN = 0.7f

/**
 * Demo Mode's take: a moving trace and a sample sentence that appears word by word,
 * without touching the microphone, so the mic works the same with no permissions and
 * no computer.
 */
internal class DemoDictationEngine : DictationEngine {
    private val main = Handler(Looper.getMainLooper())
    private var heard: ((String) -> Unit)? = null
    private var finished: ((DictationResult) -> Unit)? = null

    override fun start(
        meter: DictationMeter,
        heard: (String) -> Unit,
        finished: (DictationResult) -> Unit
    ): DictationFailure? {
        this.heard = heard
        this.finished = finished
        fun tick() {
            meter.level = LOW_LEVEL + Random.nextFloat() * LEVEL_SPAN
            main.postDelayed(::tick, LEVEL_STEP_MS)
        }
        tick()
        val words = WORDS.split(" ")
        for (count in 1..words.size) {
            main.postDelayed(
                { heard(words.take(count).joinToString(" ")) },
                WORD_STEP_MS * count
            )
        }
        return null
    }

    override fun stop() {
        main.removeCallbacksAndMessages(null)
        heard?.invoke(WORDS)
        main.postDelayed({
            val done = finished
            finished = null
            done?.invoke(DictationResult.Words(WORDS))
        }, TRANSCRIBING_MS)
    }

    override fun cancel() {
        heard = null
        finished = null
        main.removeCallbacksAndMessages(null)
    }

    companion object {
        const val WORDS = "Run the tests and fix anything that fails."
    }
}
