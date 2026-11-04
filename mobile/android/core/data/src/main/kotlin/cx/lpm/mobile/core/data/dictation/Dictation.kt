package cx.lpm.mobile.core.data.dictation

/** Why a take gave no words. */
sealed interface DictationFailure {
    data object NoSpeech : DictationFailure

    data object Denied : DictationFailure

    data object Unavailable : DictationFailure

    /** The Mac transcribing the take said why it couldn't, in words worth showing. */
    data class Computer(val message: String) : DictationFailure

    val canRetry: Boolean get() = this == NoSpeech || this is Computer
}

sealed interface DictationPhase {
    data object Idle : DictationPhase

    data object Recording : DictationPhase

    data object Transcribing : DictationPhase

    data class Failed(val failure: DictationFailure) : DictationPhase
}

/** The recorder, and the field it belongs to. */
data class DictationState(
    val phase: DictationPhase = DictationPhase.Idle,
    val owner: String? = null,
    /** When recording began, on [dictationNow]'s clock. */
    val startedAt: Long? = null,
    /** The take's length once it stops counting. */
    val lengthMs: Long = 0,
    /** What the take has heard so far. */
    val heard: String = ""
) {
    /** A take is under way in this field: it shows the recorder and a Stop. */
    fun isActive(owner: String): Boolean =
        this.owner == owner && (phase == DictationPhase.Recording || isTranscribing)

    /** What this field's take has heard so far, shown until Stop puts it in the draft. */
    fun words(owner: String): String = if (this.owner == owner) heard else ""

    fun failure(owner: String): DictationFailure? =
        (phase as? DictationPhase.Failed)?.failure?.takeIf { this.owner == owner }

    val isTranscribing: Boolean get() = phase == DictationPhase.Transcribing
}

/** A monotonic clock in milliseconds, so a take's length survives a wall-clock change. */
fun dictationNow(): Long = System.nanoTime() / NANOS_PER_MILLI

private const val NANOS_PER_MILLI = 1_000_000L

/** The current input level, 0..1: written as audio arrives, read when the recorder draws. */
class DictationMeter {
    @Volatile
    var level: Float = 0f
}

sealed interface DictationResult {
    data class Words(val text: String) : DictationResult

    data class Failed(val failure: DictationFailure) : DictationResult
}

/**
 * One take: [start] begins listening and answers why it couldn't, [stop] finishes
 * with what was heard, and [cancel] drops it. `heard` gets the words so far each time
 * they change, and `finished` runs at most once.
 */
interface DictationEngine {
    fun start(
        meter: DictationMeter,
        heard: (String) -> Unit,
        finished: (DictationResult) -> Unit
    ): DictationFailure?

    fun stop()

    fun cancel()
}
