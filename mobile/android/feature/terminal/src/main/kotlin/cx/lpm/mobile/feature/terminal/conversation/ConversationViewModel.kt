package cx.lpm.mobile.feature.terminal.conversation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.agents.AgentDialogState
import cx.lpm.mobile.core.data.agents.AgentDialogStore
import cx.lpm.mobile.core.data.conversation.ConversationDetail
import cx.lpm.mobile.core.data.conversation.ConversationList
import cx.lpm.mobile.core.data.conversation.ConversationState
import cx.lpm.mobile.core.data.conversation.ConversationStore
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.ConversationRow
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.agentRow
import cx.lpm.mobile.core.ui.AgentAsk
import cx.lpm.mobile.core.ui.ask
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** The terminal whose conversation is shown. */
data class ConversationTarget(val terminal: String, val project: String, val session: SessionKey)

/** An agent tab's conversation: followed while its screen shows, with what it waits on. */
@HiltViewModel(assistedFactory = ConversationViewModel.Factory::class)
class ConversationViewModel @AssistedInject constructor(
    @Assisted private val target: ConversationTarget,
    sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(target: ConversationTarget): ConversationViewModel
    }

    private val session = sessions[target.session]
    private val conversations = session?.store<ConversationStore>()
    private val dialogs = session?.store<AgentDialogStore>()
    private val projects = session?.store<ProjectsStore>()

    val uiState: StateFlow<ConversationUiState> =
        if (session == null || conversations == null || dialogs == null || projects == null) {
            MutableStateFlow(ConversationUiState(connected = false))
        } else {
            combine(
                conversations.state.map(::shown).distinctUntilChanged(),
                projects.state,
                dialogs.state,
                session.state,
                ::build
            )
                .stateIn(
                    viewModelScope,
                    SharingStarted.WhileSubscribed(5_000),
                    build(
                        shown(conversations.state.value),
                        projects.state.value,
                        dialogs.state.value,
                        session.state.value
                    )
                )
        }

    /** This tab's conversation; its rows are folded again only when it changes. */
    private data class Shown(
        val list: ConversationList,
        val details: Map<String, ConversationDetail>
    ) {
        val rows by lazy { ConversationRow.rows(list.items) }
    }

    private fun shown(conversations: ConversationState) = Shown(
        list = conversations.lists[target.terminal] ?: ConversationList(),
        details = conversations.details
    )

    private fun build(
        shown: Shown,
        projects: ProjectsState,
        dialogs: AgentDialogState,
        session: SessionState
    ): ConversationUiState {
        val list = shown.list
        val agent = agent(projects)
        val ask: AgentAsk? = agent?.takeIf { it.state == AgentState.NeedsYou }
            ?.let { dialogs.ask(target.terminal, it.id) }
        return ConversationUiState(
            rows = shown.rows,
            more = list.more,
            loadingEarlier = list.loadingEarlier,
            loaded = list.loaded,
            error = list.error,
            sending = list.sending,
            details = shown.details,
            agent = agent,
            ask = ask,
            connected = !session.away
        )
    }

    private fun agent(projects: ProjectsState): ProjectAgentRow? =
        projects.project(target.project)?.let { agentRow(it, target.terminal, clock.millis()) }

    /** The screen came up: the Mac pushes the conversation while it shows. */
    fun watch() {
        conversations?.watch(target.terminal, target.project)
    }

    fun unwatch() {
        conversations?.unwatch(target.terminal)
    }

    fun loadEarlier() {
        conversations?.loadEarlier(target.terminal, target.project)
    }

    fun loadDetail(item: ConversationItem) {
        conversations?.loadDetail(target.terminal, target.project, item)
    }

    fun detail(
        details: Map<String, ConversationDetail>,
        item: ConversationItem
    ): ConversationDetail? = details[ConversationStore.detailKey(target.terminal, item)]

    /** Ask for a waiting agent's question while the screen shows it waiting. */
    suspend fun followDialog(key: String) {
        dialogs?.follow(target.project, target.terminal, key)
    }

    fun pick(ask: AgentAsk, option: AgentDialogOption) {
        dialogs?.pick(option, ask.read)
    }
}
