package cx.lpm.mobile.core.data.dictation

import android.content.Context
import cx.lpm.mobile.core.data.session.MacSession
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

// How long the mic ignores taps after a send: Send clears the field and the mic lands
// under the same thumb, so a double tap would otherwise start a take.
private const val SEND_HOLD_OFF_MS = 600L

/** The take's engine: Demo Mode's sample, the Mac's VoiceToText, or the phone's recognizer. */
class DictationEngines @Inject constructor(
    @param:ApplicationContext private val context: Context,
    private val live: MacSession
) {
    val needsMicrophone: Boolean get() = !live.state.value.demoMode

    fun make(): DictationEngine {
        if (!needsMicrophone) return DemoDictationEngine()
        val session = live.visitSession.value ?: live
        return session.store<DictationLink>().newTake() ?: SpeechDictationEngine(context)
    }
}

/**
 * The app's one recorder. It belongs to the field that started a take, and outlives
 * the screen so a take's words still land in that field's draft after it's gone.
 * Called on the main thread.
 */
@Singleton
class DictationStore(
    private val makeEngine: () -> DictationEngine,
    private val microphoneNeeded: () -> Boolean = { false },
    private val now: () -> Long = ::dictationNow
) {
    @Inject
    constructor(engines: DictationEngines) : this(engines::make, { engines.needsMicrophone })

    private val mutableState = MutableStateFlow(DictationState())
    val state: StateFlow<DictationState> = mutableState.asStateFlow()

    val meter = DictationMeter()

    private var engine: DictationEngine? = null
    private var insert: ((String) -> Unit)? = null

    // Bumped by every new or abandoned take, so a late answer from an older one is dropped.
    private var take = 0
    private var holdOffUntil = Long.MIN_VALUE

    /** Whether a take needs the microphone permission first. */
    val needsMicrophone: Boolean get() = microphoneNeeded()

    private val busy: Boolean
        get() = state.value.phase == DictationPhase.Recording || state.value.isTranscribing

    /** Start a take for [owner]; [insert] receives its words. */
    fun start(owner: String, insert: (String) -> Unit) {
        if (now() < holdOffUntil || busy) return
        take += 1
        val current = take
        this.insert = insert
        val engine = makeEngine()
        this.engine = engine
        val failure = engine.start(
            meter,
            heard = { words ->
                if (current == take) mutableState.value = state.value.copy(heard = words)
            },
            finished = { ended(it, current) }
        )
        if (failure != null) {
            fail(owner, failure)
        } else {
            mutableState.value = DictationState(DictationPhase.Recording, owner, now())
        }
    }

    /** Stop listening and keep the words. */
    fun stop() {
        val s = state.value
        if (s.phase != DictationPhase.Recording) return
        val length = s.startedAt?.let { now() - it } ?: 0
        mutableState.value = s.copy(phase = DictationPhase.Transcribing, lengthMs = length)
        engine?.stop()
    }

    /** Drop the take or its notice. */
    fun cancel() {
        take += 1
        engine?.cancel()
        reset()
    }

    /** The microphone was refused: there's no take, just the notice. */
    fun refuse(owner: String) {
        if (!busy) fail(owner, DictationFailure.Denied)
    }

    /** The field left the screen: finish what it started rather than listen out of sight. */
    fun leave(owner: String) {
        val s = state.value
        if (s.owner != owner) return
        if (s.failure(owner) != null) cancel() else stop()
    }

    /** A field that can't take the words after it leaves ends the take with it. */
    fun abandon(owner: String) {
        if (state.value.owner == owner) cancel()
    }

    fun noteSent() {
        holdOffUntil = now() + SEND_HOLD_OFF_MS
    }

    private fun ended(result: DictationResult, current: Int) {
        if (current != take) return
        when (result) {
            is DictationResult.Words -> {
                val insert = insert
                reset()
                insert?.invoke(result.text)
            }

            is DictationResult.Failed -> fail(state.value.owner, result.failure)
        }
    }

    private fun fail(owner: String?, failure: DictationFailure) {
        engine = null
        meter.level = 0f
        mutableState.value = DictationState(DictationPhase.Failed(failure), owner)
    }

    private fun reset() {
        engine = null
        insert = null
        meter.level = 0f
        mutableState.value = DictationState()
    }
}
