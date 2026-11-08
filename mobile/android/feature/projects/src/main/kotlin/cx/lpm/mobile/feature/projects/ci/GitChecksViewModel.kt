package cx.lpm.mobile.feature.projects.ci

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.git.GitChecksStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.AgentLaunch
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitMergeMethod
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.core.model.MergedPullRequest
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.launchpadTabs
import cx.lpm.mobile.feature.projects.ActionRunStep
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/**
 * The project's CI in its menu and its sheet (iOS `ProjectRunControl` + `GitChecksSheet`
 * + `GitMergeSection`).
 */
data class GitChecksUiState(
    /** The Mac answers `gitChecks`. */
    val available: Boolean = false,
    val checks: GitChecks? = null,
    val branch: String = "",
    /** Local commits the upstream hasn't seen. */
    val ahead: Int = 0,
    val rerunning: Boolean = false,
    val rerunError: String? = null,
    /** The Mac starts agents in new tabs. */
    val canFix: Boolean = false,
    /**
     * What can fix the failing checks: the agents the New Tab sheet offers, as the
     * desktop's checks menu lists them; null until the Mac says which it has.
     */
    val fixTabs: List<LaunchpadTab>? = null,
    val step: ActionRunStep? = null,
    /** The Mac merges pull requests (`gitMergePr`). */
    val canMerge: Boolean = false,
    val merging: Boolean = false,
    val mergeError: String? = null,
    /** The pull request this phone just merged, until the sheet closes. */
    val merged: MergedPullRequest? = null,
    /** The method last merged with, as the wire names it. */
    val mergeMethod: String = GitMergeMethod.SQUASH.wire
) {
    val unpushedNote: String? get() = checks?.unpushedNote(ahead)

    /** The remembered method when the repository allows it, else the first it allows. */
    val selectedMethod: GitMergeMethod
        get() {
            val methods = checks?.pr?.merge?.methods.orEmpty()
            return methods.firstOrNull { it.wire == mergeMethod } ?: methods.firstOrNull()
                ?: GitMergeMethod.SQUASH
        }
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = GitChecksViewModel.Factory::class)
class GitChecksViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    private val actionMemory: ActionMemory,
    private val prefs: AppPreferences
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(project: String, session: SessionKey): GitChecksViewModel
    }

    private val session: MacSession? get() = sessions[sessionKey]
    private val step = MutableStateFlow<ActionRunStep?>(null)

    private val mergeMethod = prefs.data.map {
        prefs.string(PreferenceKeys.GIT_MERGE_METHOD) ?: GitMergeMethod.SQUASH.wire
    }

    /** The option whose inputs or confirmation are up. */
    private var fixing: LaunchpadOption? = null

    val uiState: StateFlow<GitChecksUiState> = sessions.session(sessionKey)
        .flatMapLatest { s -> s?.let(::checksState) ?: flowOf(GitChecksUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), GitChecksUiState())

    private fun checksState(s: MacSession) = combine(
        s.store<GitChecksStore>().state,
        s.store<GitStore>().state,
        s.state,
        fixTabs(s),
        combine(step, mergeMethod, ::Pair)
    ) { ci, git, _, tabs, (step, method) ->
        val snapshot = git.snapshots[project]
        val store = s.store<GitChecksStore>()
        GitChecksUiState(
            available = store.available,
            checks = ci.results[project],
            branch = snapshot?.branch.orEmpty(),
            ahead = snapshot?.ahead ?: 0,
            rerunning = project in ci.rerunning,
            rerunError = ci.rerunErrors[project],
            canFix = s.store<AgentLaunchStore>().canLaunchAgents,
            fixTabs = tabs,
            step = step,
            canMerge = store.canMerge,
            merging = project in ci.merging,
            mergeError = ci.mergeErrors[project],
            merged = ci.merged[project],
            mergeMethod = method
        )
    }

    private fun fixTabs(s: MacSession) = combine(
        s.store<AgentLaunchStore>().state,
        s.store<ProjectsStore>().state,
        actionMemory.state
    ) { launch, projects, remembered ->
        val agents = s.store<AgentLaunchStore>()
        val actions = if (agents.canPromptActions) {
            projects.project(
                project
            )?.actions.orEmpty()
        } else {
            emptyList()
        }
        launch.options?.let { options ->
            launchpadTabs(actions, options, skipOwnTasks = true) {
                remembered.lastUsed(project, it)
            }
        }
    }.distinctUntilChanged()

    fun load() {
        session?.store<GitChecksStore>()?.load(project)
    }

    /** The sheet came up: ask which agents the Mac can start now. */
    fun loadAgents() {
        session?.store<AgentLaunchStore>()?.takeIf { it.canLaunchAgents }?.loadOptions()
    }

    fun rerun() {
        session?.store<GitChecksStore>()?.rerun(project)
    }

    fun merge(method: GitMergeMethod, deleteBranch: Boolean) {
        session?.store<GitChecksStore>()?.merge(project, method, deleteBranch)
    }

    fun pickMergeMethod(method: GitMergeMethod) {
        prefs.setString(PreferenceKeys.GIT_MERGE_METHOD, method.wire)
    }

    /** The sheet closed. */
    fun forgetMerge() {
        session?.store<GitChecksStore>()?.forgetMerge(project)
    }

    /**
     * [option] in a new tab, told what the desktop's Fix with … tells it. An action with
     * inputs or a confirmation asks for them first: false until it starts.
     */
    fun fix(option: LaunchpadOption, onSpawn: (TerminalInfo) -> Unit): Boolean {
        val action = option.action
        when {
            action == null -> {
                val prompt = uiState.value.checks?.fixPrompt ?: return true
                session?.store<AgentLaunchStore>()?.newTerminal(
                    project,
                    AgentLaunch(agent = option.agent, prompt = prompt),
                    onSpawn
                )
            }

            action.inputs.isNotEmpty() -> ask(option, ActionRunStep.Inputs(action))

            action.confirm -> ask(option, ActionRunStep.Confirm(action, emptyMap()))

            else -> run(option, action, emptyMap(), onSpawn)
        }
        return step.value == null
    }

    /** The action's inputs are in: its confirmation, or it starts (true). */
    fun submitInputs(values: Map<String, String>, onSpawn: (TerminalInfo) -> Unit): Boolean {
        val inputs = step.value as? ActionRunStep.Inputs ?: return false
        if (inputs.action.confirm) {
            step.value = ActionRunStep.Confirm(inputs.action, values)
            return false
        }
        step.value = null
        fixing?.let { run(it, inputs.action, values, onSpawn) }
        return true
    }

    fun confirm(onSpawn: (TerminalInfo) -> Unit) {
        val confirm = step.value as? ActionRunStep.Confirm ?: return
        step.value = null
        fixing?.let { run(it, confirm.action, confirm.values, onSpawn) }
    }

    /** Cancel the inputs or the confirmation, if still showing. */
    fun dismissStep(shown: ActionRunStep) {
        step.compareAndSet(shown, null)
    }

    private fun ask(option: LaunchpadOption, next: ActionRunStep) {
        fixing = option
        step.value = next
    }

    /**
     * Run the agent action with the failing checks as its first prompt. An item run from
     * a `last-used` split becomes the one it leads with, as on the desktop.
     */
    private fun run(
        option: LaunchpadOption,
        action: Action,
        values: Map<String, String>,
        onSpawn: (TerminalInfo) -> Unit
    ) {
        val prompt = uiState.value.checks?.fixPrompt ?: return
        option.group?.let { group ->
            group.lastUsedKey(action)?.let { actionMemory.rememberChild(project, group.name, it) }
        }
        session?.store<ActionsStore>()?.runAction(
            project,
            action.name,
            values,
            confirmed = true,
            prompt = prompt,
            onSpawn = onSpawn
        )
    }
}
