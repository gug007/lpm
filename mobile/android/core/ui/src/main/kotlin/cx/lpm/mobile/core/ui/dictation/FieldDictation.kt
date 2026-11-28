package cx.lpm.mobile.core.ui.dictation

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.dictation.DictationMeter
import cx.lpm.mobile.core.data.dictation.DictationState

/** The app's recorder as one field sees it; `start` asks for the microphone if it must. */
@Immutable
class FieldDictation(
    val state: DictationState,
    val owner: String,
    val meter: DictationMeter,
    val start: () -> Unit,
    val stop: () -> Unit,
    val cancel: () -> Unit
) {
    val active: Boolean get() = state.isActive(owner)
    val stripShown: Boolean get() = active || state.failure(owner) != null
    val heard: String get() = state.words(owner)
}
