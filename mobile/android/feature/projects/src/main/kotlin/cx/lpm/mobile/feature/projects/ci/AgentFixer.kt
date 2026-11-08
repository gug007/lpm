package cx.lpm.mobile.feature.projects.ci

import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.AgentLaunch
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.launchpadTabs
import cx.lpm.mobile.feature.projects.ActionRunStep
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * What can fix something in [project]: the agents the New Tab sheet offers, as the
 * desktop's checks menu lists them; null until the Mac says which it has.
 */
internal fun fixTabs(
    s: MacSession,
    project: String,
    actionMemory: ActionMemory
): Flow<List<LaunchpadTab>?> = combine(
    s.store<AgentLaunchStore>().state,
    s.store<ProjectsStore>().state,
    actionMemory.state
) { launch, projects, remembered ->
    val actions = if (s.store<AgentLaunchStore>().canPromptActions) {
        projects.project(project)?.actions.orEmpty()
    } else {
        emptyList()
    }
    launch.options?.let { options ->
        launchpadTabs(actions, options, skipOwnTasks = true) {
            remembered.lastUsed(project, it)
        }
    }
}.distinctUntilChanged()

/**
 * A Fix with … row's pick (iOS `AppModel.startFix`), started in a new tab with
 * [prompt] as its agent's first prompt: a bare agent at once, an agent action once its
 * inputs and confirmation are in ([step]). An item run from a `last-used` split
 * becomes the one it leads with, as on the desktop.
 */
internal class AgentFixer(
    private val project: String,
    private val session: () -> MacSession?,
    private val actionMemory: ActionMemory,
    private val prompt: () -> String?
) {
    private val _step = MutableStateFlow<ActionRunStep?>(null)

    /** The action inputs or confirmation that are up. */
    val step: StateFlow<ActionRunStep?> = _step.asStateFlow()

    /** The option whose inputs or confirmation are up. */
    private var fixing: LaunchpadOption? = null

    /** Starts [option], or asks for its action's inputs or confirmation: false until it starts. */
    fun fix(option: LaunchpadOption, onSpawn: (TerminalInfo) -> Unit): Boolean {
        val action = option.action
        when {
            action == null -> {
                val prompt = prompt() ?: return true
                session()?.store<AgentLaunchStore>()?.newTerminal(
                    project,
                    AgentLaunch(agent = option.agent, prompt = prompt),
                    onSpawn
                )
            }

            action.inputs.isNotEmpty() -> ask(option, ActionRunStep.Inputs(action))

            action.confirm -> ask(option, ActionRunStep.Confirm(action, emptyMap()))

            else -> run(option, action, emptyMap(), onSpawn)
        }
        return _step.value == null
    }

    /** The action's inputs are in: its confirmation, or it starts (true). */
    fun submitInputs(values: Map<String, String>, onSpawn: (TerminalInfo) -> Unit): Boolean {
        val inputs = _step.value as? ActionRunStep.Inputs ?: return false
        if (inputs.action.confirm) {
            _step.value = ActionRunStep.Confirm(inputs.action, values)
            return false
        }
        _step.value = null
        fixing?.let { run(it, inputs.action, values, onSpawn) }
        return true
    }

    fun confirm(onSpawn: (TerminalInfo) -> Unit) {
        val confirm = _step.value as? ActionRunStep.Confirm ?: return
        _step.value = null
        fixing?.let { run(it, confirm.action, confirm.values, onSpawn) }
    }

    /** Cancel the inputs or the confirmation, if still showing. */
    fun dismissStep(shown: ActionRunStep) {
        _step.compareAndSet(shown, null)
    }

    private fun ask(option: LaunchpadOption, next: ActionRunStep) {
        fixing = option
        _step.value = next
    }

    private fun run(
        option: LaunchpadOption,
        action: Action,
        values: Map<String, String>,
        onSpawn: (TerminalInfo) -> Unit
    ) {
        val prompt = prompt() ?: return
        option.group?.let { group ->
            group.lastUsedKey(action)?.let { actionMemory.rememberChild(project, group.name, it) }
        }
        session()?.store<ActionsStore>()?.runAction(
            project,
            action.name,
            values,
            confirmed = true,
            prompt = prompt,
            onSpawn = onSpawn
        )
    }
}
