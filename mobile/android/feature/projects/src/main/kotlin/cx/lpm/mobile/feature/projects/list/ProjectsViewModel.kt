package cx.lpm.mobile.feature.projects.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.automations.AutomationsState
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.link.LinkState
import cx.lpm.mobile.core.data.link.LinkStatusLine
import cx.lpm.mobile.core.data.link.LinkView
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.ThisDevice
import cx.lpm.mobile.core.data.machines.MachineImporter
import cx.lpm.mobile.core.data.machines.MachineSection
import cx.lpm.mobile.core.data.machines.PairedMachineFeeds
import cx.lpm.mobile.core.data.machines.canShowAllMachines
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.projects.archiveAgent
import cx.lpm.mobile.core.data.projects.canArchiveAgents
import cx.lpm.mobile.core.data.projects.canPinProjects
import cx.lpm.mobile.core.data.projects.markAgentSeen
import cx.lpm.mobile.core.data.projects.markAgentUnread
import cx.lpm.mobile.core.data.projects.setPinned
import cx.lpm.mobile.core.data.projects.undoAgentArchive
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MachineVisit
import cx.lpm.mobile.core.data.session.SessionAlerts
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.tips.TipsStore
import cx.lpm.mobile.core.data.tips.firstOpen
import cx.lpm.mobile.core.model.AppTip
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.WorkStatusInput
import cx.lpm.mobile.core.model.agentAmbient
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update

/** The projects list on the live Mac (iOS `ProjectsView`). */
@HiltViewModel
class ProjectsViewModel @Inject constructor(
    private val session: MacSession,
    private val clock: Clock,
    private val device: ThisDevice,
    private val feeds: PairedMachineFeeds,
    private val tips: TipsStore
) : ViewModel() {
    private val projects: ProjectsStore = session.store()
    private val terminals: TerminalsStore = session.store()
    private val automations: AutomationsStore = session.store()
    private val machines: MachineImporter = session.store()
    private val git: GitStore = session.store()
    private val expanded = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    private val removing = MutableStateFlow<String?>(null)

    val alerts: StateFlow<SessionAlerts.Alerts> = session.alerts.alerts

    private val link: Flow<Pair<LinkState, LinkView>> =
        combine(session.link.state, session.link.views, ::Pair)

    private val extras: Flow<ListExtras> = combine(
        terminals.state,
        automations.state,
        expanded,
        feeds.enabled,
        tips.closed
    ) { t, jobs, open, allMachines, closed ->
        ListExtras(t.terminalTitles, jobs, open, allMachines, closed)
    }

    val uiState: StateFlow<ProjectsUiState> = combine(
        session.state,
        link,
        projects.state,
        feeds.listedSections,
        extras
    ) { s, (linkState, view), p, sections, extras ->
        buildState(s, linkState, view, p, sections, extras)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProjectsUiState())

    /** The copy whose Remove is being confirmed: its git status, for the work only it has. */
    val removal: StateFlow<CopyRemovalCheck?> = combine(removing, git.state) { name, g ->
        name?.let { CopyRemovalCheck(g.snapshots[it], checking = it in g.loading) }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    init {
        // Terminal rows are named after their tabs, and only the Mac knows those
        // names: ask again whenever an agent starts somewhere new.
        projects.state
            .map { s -> s.projects.filter { it.hasAgentStatus }.map { it.name } }
            .distinctUntilChanged()
            .onEach { names -> names.forEach(terminals::loadTerminals) }
            .launchIn(viewModelScope)
    }

    /** What the list reads besides the session, the link and the projects. */
    private data class ListExtras(
        val titles: Map<String, Map<String, String>>,
        val jobs: AutomationsState,
        val open: Map<String, Boolean>,
        val allMachines: Boolean,
        val closedTips: Set<String>
    )

    private fun buildState(
        s: SessionState,
        link: LinkState,
        view: LinkView,
        p: ProjectsState,
        sections: List<MachineSection>,
        extras: ListExtras
    ): ProjectsUiState {
        val ready = s.isReady
        val stale = link.listAsOf != null && !ready
        val jobs = extras.jobs
        val inputs = RowInputs(
            terminalTitles = extras.titles,
            queued = link.queued,
            stale = stale,
            expanded = extras.open,
            now = clock.millis(),
            machines = sections,
            activeMacId = s.activeMacId,
            archivable = projects.canArchiveAgents,
            canPin = projects.canPinProjects
        )
        val rows = p.listRows(inputs)
        // The badge counts the agents of the Mac's connected machines too.
        val ambient = agentAmbient(p.projects + sections.flatMap { it.machine.projects.orEmpty() })
        val waiting = link.waitingCount
        val dragging = link.slowConnect && view.issue?.isConnecting == true
        return ProjectsUiState(
            title = MacTitleState(
                name = s.activeRecord?.displayName ?: "Mac",
                status = view.statusLine,
                detail = when {
                    waiting > 0 && !ready -> MacTitleDetail.Waiting(waiting)

                    view.statusLine.tone == LinkStatusLine.Tone.Problem ||
                        dragging -> MacTitleDetail.Details

                    else -> null
                },
                opensDetails = !s.demoMode,
                showAllMachines = extras.allMachines.takeIf { s.canShowAllMachines() }
            ),
            macs = s.macs.map { macChoice(it, s, link, view) },
            demoMode = s.demoMode,
            rows = rows,
            pinned = p.pinnedRows(inputs),
            tip = extras.closedTips.firstOpen(listOf(AppTip.ProjectMenu))
                .takeIf { p.projects.isNotEmpty() },
            listIsEmpty = p.projects.isEmpty() && sections.isEmpty(),
            loaded = p.projectsLoaded,
            issue = view.visibleIssue?.takeUnless { it.isConnecting },
            listAge = link.listAsOf?.takeIf { stale && !view.quietReconnect },
            // A Mac that revoked this device is up; it just won't take anything from it.
            repairFooter = RepairFooter(device.noun, view.macLabel)
                .takeIf { s.needsRepair || link.identityRejected },
            folders = p.groups,
            duplicateDefaults = p.duplicateDefaults,
            duplicateProgress = p.duplicateProgress,
            badge = when {
                ambient.needsYou > 0 -> MoreBadge.NeedsYou
                ambient.isLit -> MoreBadge.Problem
                jobs.unread > 0 -> MoreBadge.Automations
                else -> MoreBadge.None
            },
            automationsUnread = jobs.unread,
            workStatusMenu = p.workStatusMenu,
            pendingArchive = p.pendingAgentArchive
        )
    }

    private fun macChoice(
        mac: MacRecord,
        s: SessionState,
        link: LinkState,
        view: LinkView
    ): MacChoice {
        val active = mac.localId == s.activeMacId
        return MacChoice(
            id = mac.localId,
            name = mac.displayName,
            active = active,
            linuxHost = mac.isLinuxHost,
            status = if (active) {
                MacStatus.Live(view.statusLine.text)
            } else {
                MacStatus.Reach(link.reach[mac.localId], mac.lastConnected)
            }
        )
    }

    fun toggleFolder(folder: ProjectFolder, expandedNow: Boolean) =
        expanded.update { it + (folder.id to !expandedNow) }

    fun toggleMachine(slug: String, expandedNow: Boolean) =
        expanded.update { it + ("m:$slug" to !expandedNow) }

    /** Open or fold again the seen agents past the Mac's limit. */
    fun toggleSeenAgents(project: Project) {
        val key = "s:" + project.name
        expanded.update { it + (key to (it[key] != true)) }
    }

    fun archiveAgent(project: Project, row: ProjectAgentRow) =
        projects.archiveAgent(row, project.name)

    fun undoArchive() = projects.undoAgentArchive()

    fun markAgentSeen(project: Project, row: ProjectAgentRow) =
        projects.markAgentSeen(row, project.name)

    fun markAgentUnread(project: Project, row: ProjectAgentRow) =
        projects.markAgentUnread(row, project.name)

    /** Open one of the Mac's machines, or another saved here, in place of the live Mac. */
    fun switchToMachine(slug: String) {
        feeds.section(slug)?.let(machines::switchTo)
    }

    /**
     * Open a machine's project, or one of its terminals, in a session of its own while
     * this Mac stays connected; null when it can't be opened from here.
     */
    fun visit(slug: String, project: String, terminal: String? = null): MachineVisit? {
        val section = feeds.section(slug) ?: return null
        return session.beginVisit(section.machine, section.record, project, terminal)
    }

    suspend fun refresh() = projects.refresh()

    fun refreshReach() = session.link.refreshReach()

    fun leaveVisit() = session.leaveVisit()

    fun start(project: Project, profile: String) = projects.startProject(project, profile)

    fun duplicate(project: Project, options: DuplicateOptions) =
        projects.duplicateProject(project, options)

    fun remove(project: Project) = projects.removeProject(project)

    /** Remove was asked for: read the copy's git status for what only it holds. */
    fun checkRemoval(project: Project) {
        removing.value = project.name
        git.load(project.name)
    }

    fun endRemovalCheck() {
        removing.value = null
    }

    fun moveToFolder(project: Project, folder: String?) = projects.moveProject(project, folder)

    fun setPinned(project: Project, pinned: Boolean) = projects.setPinned(project, pinned)

    fun setShowAllMachines(on: Boolean) = feeds.setEnabled(on)

    fun closeTip(tip: AppTip) = tips.close(tip)

    fun createFolder(name: String) = projects.createFolder(name)

    fun renameFolder(folder: ProjectFolder, name: String) = projects.renameFolder(folder, name)

    fun deleteFolder(folder: ProjectFolder) = projects.deleteFolder(folder)

    fun setWorkStatus(project: String, input: WorkStatusInput?) =
        projects.setWorkStatus(project, input)

    fun cancelQueued(id: String) = session.link.cancelQueued(id)

    fun retryQueued(id: String) = session.link.retryQueued(id)

    fun exitDemo() = session.exitDemo()

    fun switchTo(macId: String) {
        session.state.value.macs.firstOrNull { it.localId == macId }?.let(session::switchTo)
    }

    fun addMachine() = session.beginAddMac()

    fun manageMachines() = session.link.update { it.copy(manageOpen = true) }

    fun showConnectionDetails() = session.link.update { it.copy(sheetOpen = true) }

    fun dismissError() = session.alerts.dismissError()

    fun dismissNotice() = session.alerts.dismissNotice()
}
