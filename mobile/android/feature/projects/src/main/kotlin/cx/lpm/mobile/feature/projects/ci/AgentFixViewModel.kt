package cx.lpm.mobile.feature.projects.ci

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.ActionRunStep
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

/** The Fix with … rows another feature shows, and the action inputs or confirmation up. */
@Immutable
data class AgentFixUiState(val tabs: List<LaunchpadTab>? = null, val step: ActionRunStep? = null)

/**
 * The CI sheet's Fix with … rows for another feature's screen (the commit sheet's hook
 * panel, iOS `CiFixRows` + `AppModel.startFix`): each pick opens a new tab whose agent
 * is told the prompt given with it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = AgentFixViewModel.Factory::class)
class AgentFixViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    actionMemory: ActionMemory
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(project: String, session: SessionKey): AgentFixViewModel
    }

    private val session: MacSession? get() = sessions[sessionKey]

    /** What the agent being started is told, kept while its inputs are asked for. */
    private var prompt: String? = null
    private val fixer = AgentFixer(project, { session }, actionMemory) { prompt }

    val uiState: StateFlow<AgentFixUiState> = sessions.session(sessionKey)
        .flatMapLatest { s ->
            s?.let { combine(fixTabs(it, project, actionMemory), fixer.step, ::AgentFixUiState) }
                ?: flowOf(AgentFixUiState())
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AgentFixUiState())

    /** The rows came up: ask which agents the Mac can start now. */
    fun loadAgents() {
        session?.store<AgentLaunchStore>()?.takeIf { it.canLaunchAgents }?.loadOptions()
    }

    /**
     * [option] in a new tab, told [prompt]. An action with inputs or a confirmation
     * asks for them first: false until it starts.
     */
    fun fix(option: LaunchpadOption, prompt: String, onSpawn: (TerminalInfo) -> Unit): Boolean {
        this.prompt = prompt
        return fixer.fix(option, onSpawn)
    }

    /** The action's inputs are in: its confirmation, or it starts (true). */
    fun submitInputs(values: Map<String, String>, onSpawn: (TerminalInfo) -> Unit): Boolean =
        fixer.submitInputs(values, onSpawn)

    fun confirm(onSpawn: (TerminalInfo) -> Unit) = fixer.confirm(onSpawn)

    /** Cancel the inputs or the confirmation, if still showing. */
    fun dismissStep(shown: ActionRunStep) = fixer.dismissStep(shown)
}
