package cx.lpm.mobile.feature.mac.keepawake

import androidx.compose.runtime.Composable
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.MacKeepAwake
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.data.KeepAwakeState
import cx.lpm.mobile.feature.mac.data.KeepAwakeStore
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

data class KeepAwakeUiState(
    val keepAwake: KeepAwakeState = KeepAwakeState(),
    /** How a sentence names the Mac ("Studio Mac", "your Mac"). */
    val macLabel: String = ""
) {
    /** The Mac's Keep awake when it can be kept awake, else null. */
    val offered: MacKeepAwake? get() = keepAwake.keepAwake?.takeIf { it.supported }
}

/** Keep awake on one session's Mac: the connection sheet's section and the Mac menu. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = KeepAwakeViewModel.Factory::class)
class KeepAwakeViewModel @AssistedInject constructor(
    @Assisted val session: SessionKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val store: KeepAwakeStore? get() = sessions[session]?.store()

    val uiState: StateFlow<KeepAwakeUiState> = sessions.session(session)
        .flatMapLatest { s ->
            s?.let {
                combine(it.store<KeepAwakeStore>().state, it.link.views) { keepAwake, view ->
                    KeepAwakeUiState(keepAwake = keepAwake, macLabel = view.macLabel)
                }
            } ?: flowOf(KeepAwakeUiState())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), KeepAwakeUiState())

    fun set(mode: MacKeepAwake.Mode, minutes: Int? = null) {
        store?.set(mode, minutes)
    }

    @AssistedFactory
    interface Factory {
        fun create(session: SessionKey): KeepAwakeViewModel
    }
}

@Composable
internal fun keepAwakeViewModel(session: SessionKey): KeepAwakeViewModel =
    hiltViewModel<KeepAwakeViewModel, KeepAwakeViewModel.Factory>(key = "keep-awake-$session") {
        it.create(session)
    }
