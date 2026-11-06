package cx.lpm.mobile.feature.actions.sheet

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionMemory
import cx.lpm.mobile.core.data.actions.ActionMemoryState
import cx.lpm.mobile.core.data.actions.ActionPopupStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.Zone
import cx.lpm.mobile.core.navigation.ProjectActionsKey
import cx.lpm.mobile.feature.actions.layout.ActionRows
import cx.lpm.mobile.feature.actions.layout.ZoneList
import cx.lpm.mobile.feature.actions.run.ActionPicks
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

data class ProjectActionsUiState(
    val project: String = "",
    val zones: List<Zone> = emptyList(),
    val rows: ActionRows = ActionRows(),
    /** Actions the Mac left out for a config problem, each naming its problem. */
    val actionErrors: List<String> = emptyList(),
    val memory: ActionMemoryState = ActionMemoryState(),
    /** The Mac makes action popups: a long press offers "Show Popup". */
    val popups: Boolean = false
) {
    /** The open list among a zone's [lists]: the remembered layer, else the first. */
    fun openIndex(zone: String, lists: List<ZoneList>): Int {
        val stored = memory.openLayer(project, zone)
        return lists.indexOfFirst { it.layer?.name == stored }.coerceAtLeast(0)
    }
}

/** The ⚡ sheet (iOS `ProjectActionsSheet`): the project's actions, laid out as on the Mac. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = ProjectActionsViewModel.Factory::class)
class ProjectActionsViewModel @AssistedInject constructor(
    @Assisted val key: ProjectActionsKey,
    sessions: MacSessions,
    private val memory: ActionMemory,
    private val picks: ActionPicks
) : ViewModel() {
    val uiState: StateFlow<ProjectActionsUiState> = sessions.session(
        key.session
    ).flatMapLatest { session ->
        combine(
            session?.store<ProjectsStore>()?.state ?: flowOf(null),
            memory.state
        ) { projects, remembered ->
            val project = projects?.project(key.project)
            ProjectActionsUiState(
                project = key.project,
                zones = project?.zones.orEmpty(),
                rows = ActionRows.of(project?.actions.orEmpty(), project?.zones.orEmpty()),
                actionErrors = project?.actionErrors.orEmpty(),
                memory = remembered,
                popups = session?.store<ActionPopupStore>()?.available == true
            )
        }
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5_000),
        ProjectActionsUiState(project = key.project)
    )

    /** Hand the picked action to the screen under the sheet, which runs it. */
    fun pick(action: Action) = picks.pick(key.session, key.project, action)

    fun showLayer(zone: String, layer: String) = memory.showLayer(key.project, zone, layer)

    fun rememberChild(group: String, child: String) =
        memory.rememberChild(key.project, group, child)

    @AssistedFactory
    interface Factory {
        fun create(key: ProjectActionsKey): ProjectActionsViewModel
    }
}
