package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.clearStatus
import cx.lpm.mobile.core.data.client.duplicateProject
import cx.lpm.mobile.core.data.client.removeProject
import cx.lpm.mobile.core.data.client.renameProject
import cx.lpm.mobile.core.data.client.requestJobs
import cx.lpm.mobile.core.data.client.requestProjects
import cx.lpm.mobile.core.data.client.requestServices
import cx.lpm.mobile.core.data.client.requestSidebar
import cx.lpm.mobile.core.data.client.requestStatus
import cx.lpm.mobile.core.data.client.restartService
import cx.lpm.mobile.core.data.client.setAutoPull
import cx.lpm.mobile.core.data.client.setWorkStatus
import cx.lpm.mobile.core.data.client.sidebarCreateFolder
import cx.lpm.mobile.core.data.client.sidebarDeleteFolder
import cx.lpm.mobile.core.data.client.sidebarMoveProject
import cx.lpm.mobile.core.data.client.sidebarRenameFolder
import cx.lpm.mobile.core.data.client.startProject
import cx.lpm.mobile.core.data.client.stopProject
import cx.lpm.mobile.core.data.client.stopService
import cx.lpm.mobile.core.data.client.toggleService
import cx.lpm.mobile.core.data.mac.ProjectSnapshots
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.WorkStatusInput
import cx.lpm.mobile.core.model.liveServiceNames
import cx.lpm.mobile.core.model.nextWorkStatus
import cx.lpm.mobile.core.model.trimmingWhitespace
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The projects list and everything done to it: start/stop, services, statuses,
 * folders, duplicates, renames and removal. Mutations the Mac confirms through the
 * projects push are shown at once (`pendingRun`, an optimistic status) and given
 * up on after a timeout so a lost request can't spin forever.
 */
class ProjectsStore(internal val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(ProjectsState())
    val state: StateFlow<ProjectsState> = mutable.asStateFlow()

    internal val client: LpmClient? get() = session.client

    // The undo window of [PendingAgentArchive], running out.
    internal var pendingAgentArchiveJob: Job? = null

    override fun wire(client: LpmClient) {
        val c = client
        c.onProjects = ::applyProjects
        c.onSidebar =
            { order, groups -> mutable.update { it.copy(sidebarOrder = order, groups = groups) } }
        // A folder mutation reply carries the updated layout; a failure surfaces once.
        c.onSidebarMutation = { order, groups, error ->
            if (error != null) {
                session.alerts.showError(error)
            } else {
                mutable.update { it.copy(sidebarOrder = order, groups = groups) }
            }
        }
        // A rename succeeds silently (the projects push refreshes the label).
        c.onRenameProject = { _, error -> error?.let(session.alerts::showError) }
        c.onWorkStatusPalette = { statuses, order ->
            mutable.update { it.copy(workStatuses = statuses, workStatusOrder = order) }
        }
        // A refused status leaves the optimistic row wearing something the Mac never
        // wrote, so re-ask for the list rather than trusting the next push.
        c.onSetWorkStatus = { _, error ->
            if (error != null) {
                session.alerts.showError(error)
                this.client?.requestProjects()
            }
        }
        c.onAutoPullMode = { mode -> mutable.update { it.copy(autoPullMode = mode) } }
        c.onSeenAgentsShown = { shown -> mutable.update { it.copy(seenAgentsShown = shown) } }
        c.onKeepFinishedAgents = { keep -> mutable.update { it.copy(keepFinishedAgents = keep) } }
        // Same for a refused auto pull choice.
        c.onSetAutoPull = { _, error ->
            if (error != null) {
                session.alerts.showError(error)
                this.client?.requestProjects()
            }
        }
        c.onProjectsChanged = {
            c.requestProjects()
            c.requestSidebar()
            c.requestJobs()
        }
        c.onStatusChanged = { project -> c.requestStatus(project) }
        c.onStatus = { project, entries, seen ->
            updateProject(project) { it.withStatus(entries, seen) }
        }
        c.onActionError = session.alerts::showError
        c.onSendQueueFull = { session.alerts.showError(SEND_QUEUE_FULL) }
        c.onDuplicateDefaults = { excludeUncommitted, reinstallDeps, pullLatest ->
            mutable.update {
                it.copy(
                    duplicateDefaults = it.duplicateDefaults.copy(
                        excludeUncommitted = excludeUncommitted,
                        reinstallDeps = reinstallDeps,
                        pullLatest = pullLatest
                    )
                )
            }
        }
        c.onDuplicateProgress = { done, total, name ->
            mutable.update {
                val progress = it.duplicateProgress?.copy(done = done, total = total)
                    ?: DuplicateProgress(source = name, done = done, total = total)
                it.copy(duplicateProgress = progress)
            }
        }
        c.onDuplicateDone = { error, warning ->
            mutable.update { it.copy(duplicateProgress = null) }
            when {
                error != null -> session.alerts.showError(error)
                warning != null -> session.alerts.showNotice(warning)
            }
        }
        c.onServices = { project, running, services, error ->
            if (error == null) {
                mutable.update {
                    it.copy(
                        services = it.services + (project to services),
                        servicesRunning = it.servicesRunning + (project to running)
                    )
                }
            }
        }
    }

    override fun reset() {
        pendingAgentArchiveJob?.cancel()
        pendingAgentArchiveJob = null
        mutable.value = ProjectsState()
    }

    override fun flushPending() = finishPendingAgentArchive()

    internal fun setPendingAgentArchive(pending: PendingAgentArchive?) =
        mutable.update { it.copy(pendingAgentArchive = pending) }

    private fun applyProjects(projects: List<Project>) {
        mutable.update { it.copy(projects = projects, projectsLoaded = true) }
        session.link.update { it.copy(listAsOf = null) }
        // Waiting actions go out against the live list, not the saved one.
        val c = client
        if (session.state.value.isReady && c != null && !session.link.state.value.pairing) {
            session.link.flushQueued(c)
        }
        mutable.update { s ->
            val pendingRun = s.pendingRun.filter { (name, desired) ->
                projects.none { it.name == name && it.running == desired }
            }
            val toggles = s.pendingServiceToggle.mapValues { (name, pending) ->
                val project = projects.firstOrNull { it.name == name } ?: return@mapValues pending
                val runningNow = project.liveServiceNames
                pending.filter { (service, desired) -> (service in runningNow) != desired }
            }
            s.copy(pendingRun = pendingRun, pendingServiceToggle = toggles)
        }
    }

    /** Show the saved list (without its agents' states) until a live one arrives. */
    fun restore(snapshot: ProjectSnapshots.Snapshot) = mutable.update {
        it.copy(
            projects = snapshot.projects.map { p -> p.withStatus(emptyList(), emptyList()) },
            workStatuses = snapshot.workStatuses,
            workStatusOrder = snapshot.workStatusOrder,
            autoPullMode = snapshot.autoPullMode,
            sidebarOrder = snapshot.sidebarOrder,
            groups = snapshot.groups
        )
    }

    /** Wear a change the Mac hasn't confirmed yet; its projects push replaces it. */
    fun updateProject(name: String, change: (Project) -> Project) = mutable.update { s ->
        s.copy(projects = s.projects.map { if (it.name == name) change(it) else it })
    }

    fun startProject(project: Project, profile: String = "") {
        val verb = if (profile.isEmpty()) "Start" else "Start $profile"
        session.whenConnected(verb, project.name) { c ->
            markRunPending(project.name, desired = true)
            c.startProject(project.name, profile)
        }
    }

    fun stopProject(project: Project) {
        session.whenConnected("Stop", project.name) { c ->
            markRunPending(project.name, desired = false)
            c.stopProject(project.name)
        }
    }

    // Spin until the projects push confirms the desired state, or give up.
    private fun markRunPending(name: String, desired: Boolean) {
        mutable.update { it.copy(pendingRun = it.pendingRun + (name to desired)) }
        session.scope.launch {
            delay(PENDING_TIMEOUT_MS)
            if (state.value.pendingRun[name] == desired) {
                mutable.update { it.copy(pendingRun = it.pendingRun - name) }
            }
        }
    }

    /** Start/stop one service; the row spins until the projects push confirms it. */
    fun toggleService(project: String, service: String) {
        val desired = !state.value.serviceRunning(project, service)
        val verb = (if (desired) "Start" else "Stop") + " " + service
        session.whenConnected(verb, project) { c ->
            // A wait for the Mac can outlast the list it was tapped on; the wire verb
            // toggles, so only send it while it still moves the right way.
            if (state.value.serviceRunning(project, service) == desired) return@whenConnected
            markServicePending(project, service, desired)
            // A Mac that has `stopService` stops without the toggle's guessing.
            if (!desired && canRestartServices) {
                c.stopService(project, service)
            } else {
                c.toggleService(project, service)
            }
        }
    }

    /**
     * Run a service again: one that ended, or one still running. A Mac without
     * `restartService` starts an ended service through the toggle instead.
     */
    fun restartService(project: String, service: String) {
        session.whenConnected("Restart $service", project) { c ->
            markServicePending(project, service, desired = true)
            if (canRestartServices) {
                c.restartService(project, service)
            } else if (!state.value.serviceRunning(project, service)) {
                c.toggleService(project, service)
            }
        }
    }

    /** Stop a service whatever its state, clearing one that ended. */
    fun stopService(project: String, service: String) {
        session.whenConnected("Stop $service", project) { c ->
            if (!canRestartServices) return@whenConnected
            markServicePending(project, service, desired = false)
            c.stopService(project, service)
        }
    }

    /** The Mac answers `restartService` and `stopService` and reports services that ended. */
    val canRestartServices: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.SERVICE_RESTART_FEATURE) == true

    private fun markServicePending(project: String, service: String, desired: Boolean) {
        setServiceToggle(project, service, desired)
        session.scope.launch {
            delay(PENDING_TIMEOUT_MS)
            if (state.value.pendingServiceToggle[project]?.get(service) == desired) {
                setServiceToggle(project, service, null)
            }
        }
    }

    private fun setServiceToggle(project: String, service: String, desired: Boolean?) =
        mutable.update { s ->
            val current = s.pendingServiceToggle[project].orEmpty()
            val next = if (desired == null) current - service else current + (service to desired)
            s.copy(pendingServiceToggle = s.pendingServiceToggle + (project to next))
        }

    /**
     * Clone a project with the chosen options. Each copy streams in through the
     * projects-changed push; a failure surfaces as an alert.
     */
    fun duplicateProject(project: Project, options: DuplicateOptions) {
        mutable.update {
            it.copy(duplicateProgress = DuplicateProgress(project.label, 0, options.count))
        }
        client?.duplicateProject(project.name, options)
    }

    /** Remove a duplicate, whose folder is deleted on the Mac. */
    fun removeProject(project: Project) {
        client?.removeProject(project.name)
    }

    /** Rename a project's label; an empty name clears it back to the id. */
    fun renameProject(project: Project, name: String) {
        val trimmed = name.trimmingWhitespace()
        if (trimmed == project.label) return
        client?.renameProject(project.name, trimmed)
    }

    /**
     * Set (or, with null, clear) a project's work status. The row wears it at once;
     * the projects push replaces it with what the Mac wrote.
     */
    fun setWorkStatus(project: String, input: WorkStatusInput?) {
        val now = session.env.clock.millis()
        updateProject(project) { it.withWorkStatus(nextWorkStatus(it.workStatus, input, now)) }
        client?.setWorkStatus(project, input)
    }

    /**
     * Set (or, with null, clear so it follows) a project's own auto pull choice. The
     * menu shows it at once; the projects push replaces it with what the Mac wrote.
     */
    fun setAutoPull(project: String, value: Boolean?) {
        updateProject(project) { it.withAutoPull(value) }
        client?.setAutoPull(project, value)
    }

    // Sidebar folders, matched by name; each reply carries the updated layout.

    fun createFolder(name: String) {
        val trimmed = name.trimmingWhitespace()
        if (trimmed.isEmpty()) return
        client?.sidebarCreateFolder(trimmed)
    }

    fun renameFolder(folder: ProjectFolder, newName: String) {
        val trimmed = newName.trimmingWhitespace()
        if (trimmed.isEmpty() || trimmed == folder.name) return
        client?.sidebarRenameFolder(folder.name, trimmed)
    }

    fun deleteFolder(folder: ProjectFolder) {
        client?.sidebarDeleteFolder(folder.name)
    }

    /** Move a project into `folder` (created if absent), or to the top level with null. */
    fun moveProject(project: Project, folder: String?) {
        client?.sidebarMoveProject(project.name, folder)
    }

    fun loadServices(project: String) {
        client?.requestServices(project)
    }

    /** Pull to refresh: re-request when live, else reconnect; then let it land. */
    suspend fun refresh() {
        val c = client
        if (session.state.value.isReady && c != null) {
            c.requestProjects()
            c.requestSidebar()
        } else {
            session.reconnectIfNeeded()
        }
        delay(REFRESH_SETTLE_MS)
    }

    /** Dismiss a finished agent status; the row goes on the tap, not the round trip. */
    fun clearAgentStatus(project: String, paneId: String, value: String) {
        if (paneId.isEmpty() || value.isEmpty()) return
        dropAgentStatus(project, paneId, setOf(value))
    }

    /**
     * Retire the finish or problem a terminal shows once the user looks at it, as
     * clicking its tab does on the desktop. A wait stays: the agent still asks.
     */
    fun markTerminalSeen(project: String, paneId: String) {
        val entries = state.value.project(project)?.statusEntries.orEmpty()
        val seen = entries.filter {
            it.paneID == paneId &&
                (it.value == "Done" || it.value == "Error")
        }
            .map { it.value }
            .toSet()
        if (seen.isNotEmpty()) dropAgentStatus(project, paneId, seen)
    }

    private fun dropAgentStatus(project: String, paneId: String, values: Set<String>) {
        settleAgentStatus(project) { it.paneID == paneId && it.value in values }
        values.forEach { client?.clearStatus(project, paneId, it) }
    }

    companion object {
        const val SEND_QUEUE_FULL = "Not connected — action not sent."
        private const val PENDING_TIMEOUT_MS = 12_000L
        private const val REFRESH_SETTLE_MS = 500L
    }
}
