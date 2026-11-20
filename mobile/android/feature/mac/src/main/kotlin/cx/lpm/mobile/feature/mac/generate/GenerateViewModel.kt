package cx.lpm.mobile.feature.mac.generate

import androidx.compose.runtime.Composable
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.GenerateRequest
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.data.GenerateState
import cx.lpm.mobile.feature.mac.data.GenerateStore
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

data class GenerateUiState(
    val generate: GenerateState = GenerateState(),
    /** How a sentence names the Mac ("Studio Mac", "your Mac"). */
    val macLabel: String = ""
)

/** One session's waiting `lpm generate` requests, for the sheet over the app. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = GenerateViewModel.Factory::class)
class GenerateViewModel @AssistedInject constructor(
    @Assisted val session: SessionKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val store: GenerateStore? get() = sessions[session]?.store()

    val uiState: StateFlow<GenerateUiState> = sessions.session(session)
        .flatMapLatest { s ->
            s?.let {
                combine(it.store<GenerateStore>().state, it.link.views) { generate, view ->
                    GenerateUiState(generate = generate, macLabel = view.macLabel)
                }
            } ?: flowOf(GenerateUiState())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GenerateUiState())

    fun answer(request: GenerateRequest, decision: String, prompt: String, key: String) {
        store?.answer(request, decision, prompt, key)
    }

    fun setAside(request: GenerateRequest) {
        store?.setAside(request)
    }

    @AssistedFactory
    interface Factory {
        fun create(session: SessionKey): GenerateViewModel
    }
}

@Composable
internal fun generateViewModel(session: SessionKey): GenerateViewModel =
    hiltViewModel<GenerateViewModel, GenerateViewModel.Factory>(key = "generate-$session") {
        it.create(session)
    }
