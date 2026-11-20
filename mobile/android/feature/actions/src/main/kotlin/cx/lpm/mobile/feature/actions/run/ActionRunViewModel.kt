package cx.lpm.mobile.feature.actions.run

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn

/** Where a run stands in the inputs → confirm → dispatch gauntlet the phone owns. */
sealed interface RunStep {
    data class Inputs(val action: Action) : RunStep

    data class Confirm(val action: Action, val values: Map<String, String>) : RunStep

    /** A headless run, its live output open in a sheet. */
    data class Background(val runId: String, val label: String) : RunStep

    /** An action with an app: its page, open in place of a run. */
    data class App(val action: Action) : RunStep
}

data class ActionRunUiState(
    /** An action the ⚡ sheet picked, waiting to start. */
    val picked: Boolean = false,
    val step: RunStep? = null
)

/**
 * Runs a project's actions from a screen that shows its ⚡ button (iOS
 * `ProjectMenuHost`'s run flow): an action with an app opens it instead; any other
 * asks for the action's inputs, then confirmation, as the desktop does, then runs it — headless on the Mac with its output in a sheet,
 * or in a terminal there, which [run]'s `onSpawn` is told about. The Mac doesn't ask
 * again (`confirmed: true`).
 */
@HiltViewModel(assistedFactory = ActionRunViewModel.Factory::class)
class ActionRunViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    private val picks: ActionPicks
) : ViewModel() {
    private val step = MutableStateFlow<RunStep?>(null)
    private val actions: ActionsStore? get() = sessions[sessionKey]?.store()
    private val pages: ActionPopupStore? get() = sessions[sessionKey]?.store()

    val uiState: StateFlow<ActionRunUiState> =
        combine(picks.pending(sessionKey, project), step) { picked, s ->
            ActionRunUiState(picked = picked != null, step = s)
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ActionRunUiState())

    /** Start the action the ⚡ sheet picked. */
    fun runPicked(onSpawn: (TerminalInfo) -> Unit) {
        picks.take(sessionKey, project)?.let { run(it, onSpawn) }
    }

    fun run(action: Action, onSpawn: (TerminalInfo) -> Unit) {
        when {
            pages?.opensApp(action) == true -> step.value = RunStep.App(action)
            action.inputs.isNotEmpty() -> step.value = RunStep.Inputs(action)
            action.confirm -> step.value = RunStep.Confirm(action, emptyMap())
            else -> dispatch(action, emptyMap(), onSpawn)
        }
    }

    fun submitInputs(values: Map<String, String>, onSpawn: (TerminalInfo) -> Unit) {
        val inputs = step.value as? RunStep.Inputs ?: return
        if (inputs.action.confirm) {
            step.value = RunStep.Confirm(inputs.action, values)
        } else {
            dispatch(inputs.action, values, onSpawn)
        }
    }

    fun confirm(onSpawn: (TerminalInfo) -> Unit) {
        val confirm = step.value as? RunStep.Confirm ?: return
        dispatch(confirm.action, confirm.values, onSpawn)
    }

    /** Cancel the inputs or the confirmation, or close the run's sheet — if still showing. */
    fun dismiss(shown: RunStep) {
        step.compareAndSet(shown, null)
    }

    private fun dispatch(
        action: Action,
        values: Map<String, String>,
        onSpawn: (TerminalInfo) -> Unit
    ) {
        val store = actions
        if (store == null) {
            step.value = null
            return
        }
        if (action.runsInBackground) {
            val runId = store.startBackground(project, action.name, action.label, values)
            step.value = RunStep.Background(runId, action.label)
        } else {
            step.value = null
            store.runAction(project, action.name, values, confirmed = true, onSpawn = onSpawn)
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, sessionKey: SessionKey): ActionRunViewModel
    }
}
