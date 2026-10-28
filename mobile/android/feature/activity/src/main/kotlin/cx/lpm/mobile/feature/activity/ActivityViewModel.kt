package cx.lpm.mobile.feature.activity

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.link.LinkState
import cx.lpm.mobile.core.data.link.LinkView
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.machines.MachineSection
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.AutomationJob
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.core.navigation.TerminalKey
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn

data class ActivityUiState(
    val activity: Activity = Activity(),
    /** Rows under their project's header rather than one list in attention order. */
    val grouped: Boolean = false,
    /** project → services with a start or stop in flight. */
    val pendingServices: Map<String, Set<String>> = emptyMap(),
    /** Projects with a stop in flight. */
    val stopping: Set<String> = emptySet(),
    /** The connection's status under the title while the Mac isn't connected. */
    val subtitle: String? = null,
    /** The Mac refusing this phone, by name: there is nothing to report on. */
    val notConnectedTo: String? = null
)

/**
 * Every agent, automation and running service across the paired Mac's projects,
 * ordered by what is waiting on you (iOS `ActivityScreen` and AppModel's Activity).
 */
@HiltViewModel
class ActivityViewModel @Inject constructor(
    private val session: MacSession,
    private val prefs: AppPreferences,
    private val clock: Clock
) : ViewModel() {
    private val projects: ProjectsStore = session.store()
    private val terminals: TerminalsStore = session.store()
    private val automations: AutomationsStore = session.store()

    private val link: Flow<Pair<LinkState, LinkView>> =
        combine(session.link.state, session.link.views, ::Pair)

    private val grouped: Flow<Boolean> = prefs.data
        .map { prefs.bool(PreferenceKeys.ACTIVITY_GROUP_BY_PROJECT) ?: false }
        .distinctUntilChanged()

    private val machines: MachineImporter = session.store()

    private val activity: Flow<Activity> = combine(
        projects.state,
        terminals.state,
        automations.state,
        machines.sections
    ) { p, t, jobs, sections -> build(p, sections, jobs.jobs, t.terminalTitles) }

    val uiState: StateFlow<ActivityUiState> = combine(
        activity,
        projects.state,
        grouped,
        session.state,
        link
    ) { activity, p, grouped, s, (linkState, view) ->
        ActivityUiState(
            activity = activity,
            grouped = grouped,
            pendingServices = p.pendingServiceToggle
                .mapValues { it.value.keys }
                .filterValues { it.isNotEmpty() },
            stopping = p.pendingRun.filterValues { !it }.keys,
            subtitle = view.statusLine.text.takeUnless { s.demoMode || s.isReady },
            notConnectedTo = view.macLabel.takeIf { s.needsRepair || linkState.identityRejected }
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ActivityUiState())

    private fun build(
        p: ProjectsState,
        sections: List<MachineSection>,
        jobs: List<AutomationJob>,
        titles: Map<String, Map<String, String>>
    ) = buildActivity(
        projects = p.projects,
        machines = sections.map {
            ActivityMachine(it.machine.slug, it.machine.name, it.machine.projects.orEmpty())
        },
        jobs = jobs,
        now = clock.millis(),
        terminalTitles = titles
    )

    /** The screen came up: the automations list and the tab names behind the agent rows. */
    fun load() {
        automations.load()
        loadActivityTerminals()
    }

    /**
     * Fetch the tab names behind the agent rows: only projects that actually report
     * an agent, so an idle Mac costs nothing.
     */
    private fun loadActivityTerminals() {
        projects.state.value.projects
            .filter { it.hasAgentStatus }
            .forEach { terminals.loadTerminals(it.name) }
    }

    /**
     * Pull to refresh: everything the screen reads comes from the projects and
     * automations lists plus the terminals behind them.
     */
    suspend fun refresh() {
        if (session.state.value.isReady) load()
        projects.refresh()
    }

    fun toggleGrouped() {
        val now = prefs.bool(PreferenceKeys.ACTIVITY_GROUP_BY_PROJECT) ?: false
        prefs.setBool(PreferenceKeys.ACTIVITY_GROUP_BY_PROJECT, !now)
    }

    /** Clear a finished agent's status; the row goes on the tap, not the round trip. */
    fun dismiss(row: ActivityRow) {
        val terminal = row.terminalId ?: return
        val value = row.statusValue ?: return
        projects.clearAgentStatus(row.project.name, terminal, value)
    }

    /**
     * A lit profile means the project is running that profile and nothing else, so
     * stopping it is stopping the project.
     */
    fun runChip(project: String, chip: ActivityChip) {
        if (chip.kind == ActivityChip.Kind.Service) {
            if (chip.crashed && !chip.running) {
                projects.restartService(project, chip.name)
            } else {
                projects.toggleService(project, chip.name)
            }
            return
        }
        val p = projects.state.value.project(project) ?: return
        if (chip.running) projects.stopProject(p) else projects.startProject(p, chip.name)
    }

    /**
     * An agent on one of the Mac's machines opens there, in a visit of its own while
     * this Mac stays connected: its terminal, or its project.
     */
    fun visit(row: ActivityRow): NavKey? {
        val slug = row.project.machine ?: return null
        val project = row.project.name.ifEmpty { return null }
        val section = machines.section(slug) ?: return null
        val visit = session.beginVisit(section.machine, section.record, project, row.terminalId)
            ?: return null
        return visit.terminal?.let { TerminalKey(project, it, visit.session) }
            ?: ProjectKey(project, visit.session)
    }

    /** Back on Activity: whatever was opened on another machine is off screen. */
    fun leaveVisit() = session.leaveVisit()

    fun stop(project: String) {
        projects.state.value.project(project)?.let(projects::stopProject)
    }
}
