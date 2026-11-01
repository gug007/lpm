package cx.lpm.mobile.feature.projects.visit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.machines.PairedMachineFeeds
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.MachineVisit
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

/** What a machine's project shows while its session comes up. */
enum class MachineVisitContent { Loading, Detail, Unavailable }

data class MachineVisitUiState(
    val content: MachineVisitContent = MachineVisitContent.Loading,
    /** The visit's own link is up. */
    val ready: Boolean = false
)

/**
 * A machine's project opened while the live Mac stays connected (iOS
 * `MachineVisitScreen`): its screen shows the project as the machine lists it, or as
 * the live Mac lists it until the machine answers.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = MachineVisitViewModel.Factory::class)
class MachineVisitViewModel @AssistedInject constructor(
    @Assisted val key: ProjectKey,
    private val sessions: MacSessions,
    private val feeds: PairedMachineFeeds
) : ViewModel() {
    private val session: MacSession? get() = sessions[key.session]

    val uiState: StateFlow<MachineVisitUiState> = sessions.session(key.session)
        .flatMapLatest { s ->
            s?.let(::stateOf) ?: flowOf(MachineVisitUiState(MachineVisitContent.Unavailable))
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MachineVisitUiState())

    private fun stateOf(s: MacSession) = combine(
        s.state,
        s.store<ProjectsStore>().state,
        sessions.listedProject(key, feeds)
    ) { session, projects, listed ->
        val content = when {
            projects.project(key.project) != null || listed != null -> MachineVisitContent.Detail
            projects.projectsLoaded -> MachineVisitContent.Unavailable
            else -> MachineVisitContent.Loading
        }
        MachineVisitUiState(content = content, ready = session.isReady)
    }

    /** The visit's link came up: ask again for what the screen's first asks missed. */
    fun reload() {
        val s = session ?: return
        s.store<TerminalsStore>().loadTerminals(key.project)
        s.store<ActionsStore>().loadRuns(key.project)
    }

    @AssistedFactory
    interface Factory {
        fun create(key: ProjectKey): MachineVisitViewModel
    }
}

/**
 * A visited machine's project as the projects list shows it — the live Mac's own
 * machines, then the others saved here — null for the live Mac's own.
 */
internal fun MacSessions.listedProject(key: ProjectKey, feeds: PairedMachineFeeds): Flow<Project?> {
    val visit = key.session as? SessionKey.Visit ?: return flowOf(null)
    return feeds.listedSections.map { sections ->
        sections.firstOrNull { it.id == visit.id }?.machine?.projects?.firstOrNull {
            it.name == key.project
        }
    }
}

/** The screen a visit opens: its terminal, or its project. */
val MachineVisit.destination: NavKey
    get() = terminal?.let { TerminalKey(project, it, session) } ?: ProjectKey(project, session)
