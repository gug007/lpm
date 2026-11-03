package cx.lpm.mobile.feature.automations.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.navigation.AutomationsKey
import cx.lpm.mobile.feature.automations.format.AutomationClock
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

/** The automations list (iOS `AutomationsView`): every job, or one project's. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = AutomationsViewModel.Factory::class)
class AutomationsViewModel @AssistedInject constructor(
    @Assisted val key: AutomationsKey,
    private val sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    private val session: MacSession? get() = sessions[key.session]
    private val store: AutomationsStore? get() = session?.store()

    private val initial = AutomationsUiState(project = key.project)
    private val failedOnly = MutableStateFlow(false)

    val uiState: StateFlow<AutomationsUiState> = sessions.session(key.session)
        .flatMapLatest { s -> s?.let(::listState) ?: flowOf(initial) }
        .onEach { if (it.failedCount == 0) failedOnly.value = false }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), initial)

    private fun listState(s: MacSession) = combine(
        s.store<AutomationsStore>().state,
        s.store<ProjectsStore>().state,
        failedOnly
    ) { a, p, failed ->
        val now = AutomationClock(clock.instant(), clock.zone)
        a.listState(key.project, p.projects.size, now, failed)
    }

    fun load() {
        store?.load()
    }

    suspend fun refresh() {
        store?.refresh()
    }

    /** Every job reads at once; a project's page reads only its own. */
    fun markAllRead() {
        val s = store ?: return
        if (key.project == null) {
            s.markAllSeen()
        } else {
            val state = uiState.value
            (state.unread.map { it.job } + state.hiddenUnread).forEach { s.markSeen(it) }
        }
    }

    /** The Failed filter: only the rows whose last run failed. */
    fun toggleFailedOnly() {
        failedOnly.update { !it }
    }

    fun markRead(job: AutomationJob) {
        store?.markSeen(job)
    }

    fun toggleEnabled(job: AutomationJob) {
        store?.setEnabled(job, !job.enabled)
    }

    fun run(job: AutomationJob) {
        store?.run(job)
    }

    fun stop(job: AutomationJob) {
        store?.stop(job)
    }

    fun dismissError() {
        store?.dismissError()
    }

    @AssistedFactory
    interface Factory {
        fun create(key: AutomationsKey): AutomationsViewModel
    }
}
