package cx.lpm.mobile.feature.actions.popup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPageAsk
import cx.lpm.mobile.core.model.ActionPageRunResult
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.pageAction
import cx.lpm.mobile.core.model.pageInputs
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Where a page's run stands: what it asks for, then the sheet it opened. */
sealed interface PageRunStep {
    data class Inputs(val action: Action, val initial: Map<String, String>) : PageRunStep

    data class Confirm(val action: Action, val values: Map<String, String>) : PageRunStep

    data class Background(val runId: String, val label: String) : PageRunStep

    data class App(val action: Action) : PageRunStep
}

/**
 * Runs what the page in a popup or app sheet asks for (iOS `ActionPageRunHost`): an
 * action, as a tap on its button would — the inputs the page didn't give, the
 * confirmation, then the run, a background run's output in its sheet and back to the
 * page once it ends, a terminal run on the Mac. The page runs one action at a time.
 */
@HiltViewModel(assistedFactory = ActionPageRunViewModel.Factory::class)
class ActionPageRunViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val mutableStep = MutableStateFlow<PageRunStep?>(null)
    val step: StateFlow<PageRunStep?> = mutableStep.asStateFlow()

    private var reply: ((ActionPageRunResult) -> Unit)? = null
    private var spawn: ((TerminalInfo) -> Unit)? = null
    private var watcher: Job? = null

    /**
     * What the page posted, as JSON: a refresh goes to [onRefresh], a run's result to
     * [answer] as the JSON `window.__lpmReply` takes, and a terminal it opens to [onSpawn].
     */
    fun ask(
        message: String,
        onRefresh: () -> Unit,
        onSpawn: ((TerminalInfo) -> Unit)?,
        answer: (String) -> Unit
    ) {
        when (val ask = ActionPageAsk.parse(message)) {
            ActionPageAsk.Refresh -> onRefresh()
            is ActionPageAsk.Run -> start(ask, onSpawn) { answer(it.json(ask.id)) }
            null -> Unit
        }
    }

    private fun start(
        ask: ActionPageAsk.Run,
        onSpawn: ((TerminalInfo) -> Unit)?,
        answer: (ActionPageRunResult) -> Unit
    ) {
        if (reply != null) {
            return answer(ActionPageRunResult(error = "This page's last run hasn't finished."))
        }
        val actions = sessions[sessionKey]?.store<ProjectsStore>()?.state?.value?.project(
            project
        )?.actions
        val action = actions.orEmpty().pageAction(ask.action)
            ?: return answer(
                ActionPageRunResult(error = "There's no action \"${ask.action}\" in this project.")
            )
        reply = answer
        spawn = onSpawn
        val filled = action.pageInputs(ask.inputs)
        when {
            !filled.complete -> mutableStep.value = PageRunStep.Inputs(action, filled.values)
            action.confirm -> mutableStep.value = PageRunStep.Confirm(action, filled.values)
            else -> dispatch(action, filled.values)
        }
    }

    fun submitInputs(values: Map<String, String>) {
        val inputs = mutableStep.value as? PageRunStep.Inputs ?: return
        if (inputs.action.confirm) {
            mutableStep.value = PageRunStep.Confirm(inputs.action, values)
        } else {
            dispatch(inputs.action, values)
        }
    }

    fun confirm() {
        val confirm = mutableStep.value as? PageRunStep.Confirm ?: return
        dispatch(confirm.action, confirm.values)
    }

    /** The inputs or the confirmation turned down, or a sheet the run opened closed. */
    fun dismiss(shown: PageRunStep) {
        if (!mutableStep.compareAndSet(shown, null)) return
        if (shown is PageRunStep.Inputs || shown is PageRunStep.Confirm) {
            settle(ActionPageRunResult(canceled = true))
        }
    }

    private fun dispatch(action: Action, values: Map<String, String>) {
        val session = sessions[sessionKey]
        val store = session?.store<ActionsStore>()
        if (store == null) {
            mutableStep.value = null
            return settle(ActionPageRunResult(error = "This Mac isn't connected."))
        }
        when {
            session.store<ActionPopupStore>().opensApp(action) -> {
                mutableStep.value = PageRunStep.App(action)
                settle(ActionPageRunResult(ok = true))
            }

            action.runsInBackground -> {
                val runId = store.startBackground(project, action.name, action.label, values)
                mutableStep.value = PageRunStep.Background(runId, action.label)
                watcher = viewModelScope.launch {
                    store.follow(project, runId)
                    settle(ended(store, runId))
                }
            }

            else -> {
                mutableStep.value = null
                settle(ActionPageRunResult(ok = true))
                store.runAction(project, action.name, values, confirmed = true, onSpawn = spawn)
            }
        }
    }

    private fun ended(store: ActionsStore, runId: String): ActionPageRunResult {
        val state = store.state.value
        state.startErrors[runId]?.let { return ActionPageRunResult(error = it) }
        val run =
            state.outputs[runId]
                ?: return ActionPageRunResult(error = "The Mac no longer has this run.")
        val output = ActionPageRunResult.output(run.text)
        return when {
            run.success -> ActionPageRunResult(ok = true, output = output)
            run.error == CANCELLED -> ActionPageRunResult(output = output, canceled = true)
            else -> ActionPageRunResult(output = output, error = run.error)
        }
    }

    private fun settle(result: ActionPageRunResult) {
        watcher = null
        val answer = reply ?: return
        reply = null
        answer(result)
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, sessionKey: SessionKey): ActionPageRunViewModel
    }

    private companion object {
        const val CANCELLED = "cancelled"
    }
}
