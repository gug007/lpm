package cx.lpm.mobile.feature.mac.power

import androidx.compose.runtime.Composable
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.feature.mac.data.PowerState
import cx.lpm.mobile.feature.mac.data.PowerStore
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

data class PowerUiState(
    val power: PowerState = PowerState(),
    /** How the Mac is named in a sentence ("Studio Mac", "your Mac"). */
    val macLabel: String = ""
)

/** Lock or Sleep on one session's Mac: the Mac menu's submenu and its confirmation. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = PowerViewModel.Factory::class)
class PowerViewModel @AssistedInject constructor(
    @Assisted val session: SessionKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val store: PowerStore? get() = sessions[session]?.store()

    val uiState: StateFlow<PowerUiState> = sessions.session(session)
        .flatMapLatest { s ->
            s?.let {
                combine(it.store<PowerStore>().state, it.link.views) { power, view ->
                    PowerUiState(power = power, macLabel = view.macLabel)
                }
            } ?: flowOf(PowerUiState())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PowerUiState())

    fun lock() {
        store?.lock()
    }

    fun askToSleep() {
        store?.askToSleep()
    }

    fun cancelSleep() {
        store?.cancelSleep()
    }

    fun sleepNow() {
        store?.sleepNow()
    }

    fun sleepWhenIdle(on: Boolean) {
        store?.sleepWhenIdle(on)
    }

    @AssistedFactory
    interface Factory {
        fun create(session: SessionKey): PowerViewModel
    }
}

@Composable
internal fun powerViewModel(session: SessionKey): PowerViewModel =
    hiltViewModel<PowerViewModel, PowerViewModel.Factory>(key = "power-$session") {
        it.create(session)
    }
