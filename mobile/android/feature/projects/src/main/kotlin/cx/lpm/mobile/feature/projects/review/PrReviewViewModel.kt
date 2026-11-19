package cx.lpm.mobile.feature.projects.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.LaunchpadOption
import cx.lpm.mobile.core.model.LaunchpadTab
import cx.lpm.mobile.core.model.PrDiscussion
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.projects.ActionRunStep
import cx.lpm.mobile.feature.projects.ci.AgentFixer
import cx.lpm.mobile.feature.projects.ci.fixTabs
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

/** The review on the branch's pull request (iOS `PrReviewSheet`). */
data class PrReviewUiState(
    val discussion: PrDiscussion? = null,
    /** The Mac starts agents in new tabs: the review can be sent to one. */
    val canSend: Boolean = false,
    /** What the review can be sent to; null until the Mac says which agents it has. */
    val tabs: List<LaunchpadTab>? = null,
    val step: ActionRunStep? = null
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = PrReviewViewModel.Factory::class)
class PrReviewViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    private val actionMemory: ActionMemory
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(project: String, session: SessionKey): PrReviewViewModel
    }

    private val session: MacSession? get() = sessions[sessionKey]
    private val sender = AgentFixer(project, { session }, actionMemory) {
        uiState.value.discussion?.prompt?.takeIf { it.isNotEmpty() }
    }

    val uiState: StateFlow<PrReviewUiState> = sessions.session(sessionKey)
        .flatMapLatest { s -> s?.let(::reviewState) ?: flowOf(PrReviewUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), PrReviewUiState())

    private fun reviewState(s: MacSession) = combine(
        s.store<GitExtrasStore>().state,
        fixTabs(s, project, actionMemory),
        sender.step
    ) { extras, tabs, step ->
        PrReviewUiState(
            discussion = extras.discussions[project],
            canSend = s.store<AgentLaunchStore>().canLaunchAgents,
            tabs = tabs,
            step = step
        )
    }

    /** The sheet came up: the newest review, and which agents the Mac can start now. */
    fun load() {
        session?.store<AgentLaunchStore>()?.takeIf { it.canLaunchAgents }?.loadOptions()
        session?.store<GitExtrasStore>()?.loadDiscussion(project, fresh = true)
    }

    /** [option] in a new tab, told what the review says. False until it starts. */
    fun send(option: LaunchpadOption, onSpawn: (TerminalInfo) -> Unit): Boolean =
        sender.fix(option, onSpawn)

    fun submitInputs(values: Map<String, String>, onSpawn: (TerminalInfo) -> Unit): Boolean =
        sender.submitInputs(values, onSpawn)

    fun confirm(onSpawn: (TerminalInfo) -> Unit) = sender.confirm(onSpawn)

    fun dismissStep(shown: ActionRunStep) = sender.dismissStep(shown)
}
