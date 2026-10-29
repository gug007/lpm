package cx.lpm.mobile.feature.usage.recap

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.usage.WeeklyRecapState
import cx.lpm.mobile.core.data.usage.WeeklyRecapStore
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapPick
import cx.lpm.mobile.core.model.RecapWeek
import cx.lpm.mobile.core.navigation.WeeklyRecapKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** What the Weekly recap screen shows under its week and month pickers. */
sealed interface RecapBody {
    data object Loading : RecapBody

    data class Failed(val message: String) : RecapBody

    /** No agent time in the week or month: no card, and from the last one a way to this one. */
    data class Empty(val pick: RecapPick) : RecapBody

    /** A reload in flight dims the card already on screen. */
    data class Card(val view: RecapView, val caption: String, val dimmed: Boolean) : RecapBody
}

data class WeeklyRecapUiState(
    val pick: RecapPick = RecapPick(RecapWeek.Last, RecapPeriod.Week),
    val body: RecapBody = RecapBody.Loading,
    /** The paired computers the week or month on screen leaves out. */
    val missing: List<String> = emptyList(),
    /** The Mac answers for a month, so the screen offers one. */
    val months: Boolean = false
)

/**
 * The Weekly recap screen: the desktop's "My agents' week" card, last week or this one,
 * or the month's.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = WeeklyRecapViewModel.Factory::class)
class WeeklyRecapViewModel @AssistedInject constructor(
    @Assisted val key: WeeklyRecapKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val store: WeeklyRecapStore? get() = sessions[key.session]?.store()

    val uiState: StateFlow<WeeklyRecapUiState> = sessions.session(key.session)
        .flatMapLatest { s ->
            val store = s?.store<WeeklyRecapStore>()
            store?.state?.map { uiState(it, store.monthAvailable) } ?: flowOf(WeeklyRecapUiState())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), WeeklyRecapUiState())

    private fun uiState(s: WeeklyRecapState, months: Boolean): WeeklyRecapUiState {
        val recap = s.recaps[s.pick]
        val error = s.errors[s.pick]
        val body = when {
            error != null -> RecapBody.Failed(error)

            recap != null -> {
                val view = recapView(recap)
                if (view.empty) {
                    RecapBody.Empty(s.pick)
                } else {
                    RecapBody.Card(view, recapCaption(view), dimmed = s.pick in s.loading)
                }
            }

            else -> RecapBody.Loading
        }
        return WeeklyRecapUiState(
            pick = s.pick,
            body = body,
            missing = recap?.missing.orEmpty(),
            months = months
        )
    }

    /** The screen came up on last week. */
    fun open() {
        store?.screenDidOpen()
    }

    fun select(pick: RecapPick) {
        store?.select(pick)
    }

    fun retry() {
        store?.load()
    }

    suspend fun refresh() {
        store?.refresh()
    }

    fun close() {
        store?.screenDidClose()
    }

    @AssistedFactory
    interface Factory {
        fun create(key: WeeklyRecapKey): WeeklyRecapViewModel
    }
}
