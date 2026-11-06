package cx.lpm.mobile.feature.actions.popup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionPopupState
import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.data.actions.ActionPopupsState
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPopupInfo
import cx.lpm.mobile.core.model.SessionKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class ActionPopupUiState(
    /** The reply's title, else the config's, else the action's label. */
    val title: String = "",
    /** The page's height in dp. */
    val height: Int = ActionPopupInfo.DEFAULT_HEIGHT,
    val popup: ActionPopupState = ActionPopupState()
)

/**
 * An action's popup card (iOS `ActionPopupSheet`): asked for as the sheet opens, again
 * on Refresh and every `refresh` seconds, and forgotten as it closes.
 */
@HiltViewModel(assistedFactory = ActionPopupViewModel.Factory::class)
class ActionPopupViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val action: Action,
    @Assisted sessionKey: SessionKey,
    sessions: MacSessions
) : ViewModel() {
    private val store: ActionPopupStore? = sessions[sessionKey]?.store()

    val uiState: StateFlow<ActionPopupUiState> =
        (store?.state ?: flowOf(ActionPopupsState()))
            .map { uiState(it.popup(project, action.name)) }
            .stateIn(
                viewModelScope,
                SharingStarted.WhileSubscribed(5_000),
                uiState(ActionPopupState())
            )

    init {
        store?.open(project, action)
    }

    /** Refresh and Retry. */
    fun reload() {
        store?.reload(project, action.name)
    }

    /** The refresh interval passed. */
    fun tick() {
        store?.tick(project, action.name)
    }

    fun pageFailed() {
        store?.pageFailed(project, action.name)
    }

    override fun onCleared() {
        store?.close(project, action.name)
    }

    private fun uiState(popup: ActionPopupState): ActionPopupUiState {
        val info = action.popup
        val content = popup.content
        return ActionPopupUiState(
            title =
                content?.title?.ifEmpty { null } ?: info?.title?.ifEmpty { null } ?: action.label,
            height = ActionPopupInfo.pageHeight(
                content?.height ?: info?.height ?: ActionPopupInfo.DEFAULT_HEIGHT
            ),
            popup = popup
        )
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, action: Action, session: SessionKey): ActionPopupViewModel
    }
}
