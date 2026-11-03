package cx.lpm.mobile.feature.projects.newtab

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.AgentLaunch
import cx.lpm.mobile.core.model.AgentModelOption
import cx.lpm.mobile.core.model.AgentOption
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.core.model.NewTabPick
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.launchpadTabs
import cx.lpm.mobile.core.model.trimmingWhitespace
import cx.lpm.mobile.feature.projects.ActionRunStep
import cx.lpm.mobile.feature.projects.newtab.NewTabPickMemory.Companion.TERMINAL
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class NewTabUiState(
    /** What the Mac can start; null until it answers. */
    val options: List<AgentOption>? = null,
    /** The Start list after the terminal; null until the Mac says which agents it has. */
    val tabs: List<LaunchpadTab>? = null,
    /** The picked option's id, or [TERMINAL]. */
    val picked: String = TERMINAL,
    /** The model and effort a bare agent starts with. */
    val pick: NewTabPick = NewTabPick(),
    val prompt: String = "",
    /** "Resume a Past Session…" shows: the Mac lists them and the project isn't on SSH. */
    val canResume: Boolean = false,
    val step: ActionRunStep? = null
) {
    val option: LaunchpadOption? = tabs?.flatMap { it.options }?.firstOrNull { it.id == picked }

    /** The agent a bare option starts, whose model and effort can be picked. */
    val bareAgent: AgentOption? = option?.takeIf { it.action == null }
        ?.let { o -> options?.firstOrNull { it.id == o.agent } }

    val model: AgentModelOption? get() = bareAgent?.models?.firstOrNull { it.value == pick.model }

    /** A remembered agent can't show as picked until the Mac says it still offers it. */
    val awaitingOptions: Boolean get() = options == null && picked != TERMINAL

    val terminalPicked: Boolean get() = !awaitingOptions && option == null
}

/** What the Mac and the project offer a new tab, apart from what's picked. */
private data class Offer(
    val options: List<AgentOption>?,
    val tabs: List<LaunchpadTab>?,
    val canResume: Boolean
)

private data class Picks(
    val picked: String,
    val pick: NewTabPick,
    val prompt: String,
    val step: ActionRunStep?
)

/**
 * The New Tab sheet (iOS `NewTabSheet`): a plain terminal or the project's actions that
 * open an agent, as the desktop's empty project offers them, with a task for it; a
 * project without such actions offers the agents the Mac can start, each with its model
 * and effort. The pick (not the task) is remembered for next time.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = NewTabViewModel.Factory::class)
class NewTabViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    private val memory: NewTabPickMemory,
    private val actionMemory: ActionMemory
) : ViewModel() {
    private val picked = MutableStateFlow(memory.loadOption())
    private val pick = MutableStateFlow(memory.load())
    private val prompt = MutableStateFlow("")
    private val step = MutableStateFlow<ActionRunStep?>(null)
    private val picks = combine(picked, pick, prompt, step, ::Picks)
    private val session: MacSession? get() = sessions[sessionKey]

    val uiState: StateFlow<NewTabUiState> = sessions.session(sessionKey)
        .flatMapLatest { s -> s?.let(::newTabState) ?: picks.map(::idle) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), idle(picks()))

    private fun picks() = Picks(picked.value, pick.value, prompt.value, step.value)

    private fun idle(p: Picks) =
        NewTabUiState(picked = p.picked, pick = p.pick, prompt = p.prompt, step = p.step)

    private fun newTabState(s: MacSession): Flow<NewTabUiState> {
        val agents = s.store<AgentLaunchStore>()
        // Apart from the picks, so typing the task doesn't build the Start list again.
        val offer = combine(
            agents.state,
            s.store<ProjectsStore>().state,
            actionMemory.state
        ) { launch, projects, remembered ->
            val live = projects.project(project)
            val actions = if (agents.canPromptActions) live?.actions.orEmpty() else emptyList()
            Offer(
                options = launch.options,
                tabs = launch.options?.let { options ->
                    launchpadTabs(actions, options) { remembered.lastUsed(project, it) }
                },
                canResume = live != null && agents.canResumeSessions(live)
            )
        }.distinctUntilChanged()
        return combine(offer, picks) { o, p ->
            val state = idle(p).copy(options = o.options, tabs = o.tabs, canResume = o.canResume)
            state.copy(pick = fitted(p.pick, state.bareAgent, o.options))
        }
    }

    /**
     * The model pick follows the bare agent picked: one picked before keeps its model
     * and effort where the Mac still offers them, another starts on its defaults.
     */
    private fun fitted(pick: NewTabPick, agent: AgentOption?, options: List<AgentOption>?) = when {
        options == null -> pick
        agent != null && pick.agent != agent.id -> NewTabPick(agent.id).choosing("", "", agent)
        else -> pick.resolved(options)
    }

    /** The sheet came up: ask what the Mac can start now. */
    fun onAppear() {
        session?.store<AgentLaunchStore>()?.loadOptions()
    }

    fun pickTerminal() {
        picked.value = TERMINAL
    }

    fun pickOption(option: LaunchpadOption) {
        picked.value = option.id
    }

    fun chooseModel(value: String) {
        val state = uiState.value
        val agent = state.bareAgent ?: return
        pick.value = state.pick.choosing(value, state.pick.effort, agent)
    }

    fun chooseEffort(value: String) {
        pick.value = uiState.value.pick.copy(effort = value)
    }

    fun setPrompt(text: String) {
        prompt.value = text
    }

    /**
     * Open the tab, remembering the pick, and [onSpawn] opens it once it's there. An
     * action with inputs or a confirmation asks for them first: false until it opens.
     */
    fun open(onSpawn: (TerminalInfo) -> Unit): Boolean {
        val state = uiState.value
        val option = state.option
        memory.saveOption(option?.id ?: TERMINAL)
        val action = option?.action
        when {
            option == null -> launch(AgentLaunch(), onSpawn)

            action == null -> {
                memory.save(state.pick)
                launch(
                    AgentLaunch(state.pick.agent, state.pick.model, state.pick.effort, task()),
                    onSpawn
                )
            }

            action.inputs.isNotEmpty() -> step.value = ActionRunStep.Inputs(action)

            action.confirm -> step.value = ActionRunStep.Confirm(action, emptyMap())

            else -> run(option, action, emptyMap(), onSpawn)
        }
        return step.value == null
    }

    /** The action's inputs are in: its confirmation, or it opens (true). */
    fun submitInputs(values: Map<String, String>, onSpawn: (TerminalInfo) -> Unit): Boolean {
        val inputs = step.value as? ActionRunStep.Inputs ?: return false
        if (inputs.action.confirm) {
            step.value = ActionRunStep.Confirm(inputs.action, values)
            return false
        }
        step.value = null
        uiState.value.option?.let { run(it, inputs.action, values, onSpawn) }
        return true
    }

    fun confirm(onSpawn: (TerminalInfo) -> Unit) {
        val confirm = step.value as? ActionRunStep.Confirm ?: return
        step.value = null
        uiState.value.option?.let { run(it, confirm.action, confirm.values, onSpawn) }
    }

    /** Cancel the inputs or the confirmation, if still showing. */
    fun dismiss(shown: ActionRunStep) {
        step.compareAndSet(shown, null)
    }

    private fun task() = prompt.value.trimmingWhitespace()

    private fun launch(launch: AgentLaunch, onSpawn: (TerminalInfo) -> Unit) {
        session?.store<AgentLaunchStore>()?.newTerminal(project, launch, onSpawn)
    }

    /**
     * Run the picked action with the task as its agent's first prompt. An item run from
     * a `last-used` split becomes the one it leads with, as on the desktop.
     */
    private fun run(
        option: LaunchpadOption,
        action: Action,
        values: Map<String, String>,
        onSpawn: (TerminalInfo) -> Unit
    ) {
        option.group?.let { group ->
            group.lastUsedKey(action)?.let { actionMemory.rememberChild(project, group.name, it) }
        }
        session?.store<ActionsStore>()?.runAction(
            project,
            action.name,
            values,
            confirmed = true,
            prompt = task(),
            onSpawn = onSpawn
        )
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, sessionKey: SessionKey): NewTabViewModel
    }
}
