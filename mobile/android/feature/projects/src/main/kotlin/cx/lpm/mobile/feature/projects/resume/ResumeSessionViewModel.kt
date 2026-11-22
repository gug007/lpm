package cx.lpm.mobile.feature.projects.resume

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.agents.AgentSessionList
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.AgentSession
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.trimmingWhitespace
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class ResumeSessionUiState(
    /** The agent whose sessions show, a provider key; null for All. */
    val filter: String? = null,
    /** The agents the filter offers ([sessionFilterProviders]). */
    val providers: List<String> = sessionFilterProviders(emptyList(), null),
    val query: String = "",
    val list: AgentSessionList = AgentSessionList(),
    /** The rows [filter] lets through, under their day headings. */
    val groups: List<AgentSessionGroup> = emptyList()
) {
    val search: String get() = query.trimmingWhitespace()

    /** Nothing to list and nothing older to ask for: a placeholder takes the list's place. */
    val showsPlaceholder: Boolean get() = groups.isEmpty() && !list.hasMore
}

/**
 * The project's past agent conversations — Claude Code, Codex, Gemini, OpenCode and
 * Cursor (iOS `ResumeSessionList`),
 * newest first and grouped by day. Picking one continues it in a new tab, or opens the
 * tab already holding it.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = ResumeSessionViewModel.Factory::class)
class ResumeSessionViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    private val filter = MutableStateFlow<String?>(null)
    private val query = MutableStateFlow("")
    private var searching: Job? = null
    private val store: AgentLaunchStore? get() = sessions[sessionKey]?.store()

    val uiState: StateFlow<ResumeSessionUiState> = sessions.session(sessionKey)
        .flatMapLatest { s -> s?.let(::resumeState) ?: flowOf(ResumeSessionUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ResumeSessionUiState())

    private fun resumeState(s: MacSession) =
        combine(s.store<AgentLaunchStore>().state, filter, query) { launch, filter, query ->
            val list = launch.sessions[project] ?: AgentSessionList()
            val rows = filter?.let { p -> list.rows.filter { it.provider == p } } ?: list.rows
            ResumeSessionUiState(
                filter = filter,
                providers = sessionFilterProviders(list.rows.map { it.provider }, filter),
                query = query,
                list = list,
                groups = agentSessionGroups(rows, clock.instant(), clock.zone)
            )
        }

    /** The list came up: ask for the newest sessions matching the search. */
    fun onAppear() = search()

    fun setFilter(value: String?) {
        filter.value = value
    }

    fun setQuery(text: String) {
        if (text == query.value) return
        query.value = text
        search()
    }

    fun retry() {
        store?.loadSessions(project, query.value.trimmingWhitespace())
    }

    fun loadOlder() {
        store?.loadOlderSessions(project)
    }

    /**
     * Pick [session]: the live tab already holding it comes back to be opened; otherwise
     * it continues in a new tab, which [onSpawn] opens once it's there.
     */
    fun open(session: AgentSession, onSpawn: (TerminalInfo) -> Unit): TerminalInfo? {
        val store = store ?: return null
        store.openTab(session, project)?.let { return it }
        store.resumeSession(session, project, onSpawn)
        return null
    }

    // The first load goes straight out; typing settles before it asks again.
    private fun search() {
        searching?.cancel()
        searching = viewModelScope.launch {
            val q = query.value.trimmingWhitespace()
            val asked = store?.state?.value?.sessions?.get(project)?.search.orEmpty()
            if (q.isNotEmpty() || asked != q) delay(SEARCH_SETTLE_MS)
            store?.loadSessions(project, q)
        }
    }

    @AssistedFactory
    interface Factory {
        fun create(project: String, sessionKey: SessionKey): ResumeSessionViewModel
    }

    private companion object {
        const val SEARCH_SETTLE_MS = 300L
    }
}
