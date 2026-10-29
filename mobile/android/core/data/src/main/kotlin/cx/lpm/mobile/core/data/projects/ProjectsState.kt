package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.CustomWorkStatus
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.core.model.WorkStatusChoice
import cx.lpm.mobile.core.model.defaultWorkStatusPalette
import cx.lpm.mobile.core.model.liveServiceNames
import cx.lpm.mobile.core.model.workStatusMenu

/** Live progress of a running duplicate batch, shown as a HUD on the projects list. */
data class DuplicateProgress(val source: String, val done: Int, val total: Int)

data class ProjectsState(
    val projects: List<Project> = emptyList(),
    /** False until the first list arrives: "still loading", not "No projects". */
    val projectsLoaded: Boolean = false,
    /** Interleaves project names and "group:<id>" / "peer:<slug>" tokens, like the desktop. */
    val sidebarOrder: List<String> = emptyList(),
    val groups: List<ProjectFolder> = emptyList(),
    /** The Mac's work-status palette and the order the user put the Status menu in. */
    val workStatuses: List<CustomWorkStatus> = defaultWorkStatusPalette,
    val workStatusOrder: List<String> = emptyList(),
    /** The Mac's Settings › Git › Auto pull. */
    val autoPullMode: AutoPullMode = AutoPullMode.Off,
    /** The Mac's Settings › Agents › In the sidebar › Seen agents per project. */
    val seenAgentsShown: Int = 3,
    /** The Mac's Settings › Agents › In the sidebar › Keep finished agents until archived. */
    val keepFinishedAgents: Boolean = false,
    /** Agents archived here that can still be undone; hidden, not yet sent. */
    val pendingAgentArchive: PendingAgentArchive? = null,
    /** project → desired running state while a Start/Stop is in flight. */
    val pendingRun: Map<String, Boolean> = emptyMap(),
    /** project → service → desired running state while a toggle is in flight. */
    val pendingServiceToggle: Map<String, Map<String, Boolean>> = emptyMap(),
    /** project → discovered services (the @-mention "service logs" source). */
    val services: Map<String, List<ServiceInfo>> = emptyMap(),
    val servicesRunning: Map<String, Boolean> = emptyMap(),
    /** The duplicate sheet's initial toggles, mirrored from the desktop's settings. */
    val duplicateDefaults: DuplicateOptions = DuplicateOptions(),
    val duplicateProgress: DuplicateProgress? = null
) {
    /** The Status menu: what the app ships with, then the user's own, in their order. */
    val workStatusMenu: List<WorkStatusChoice> get() = workStatusMenu(workStatuses, workStatusOrder)

    /** The project a duplicate or worktree follows, while it's in the list. */
    fun parentProject(of: Project): Project? =
        if (!of.isDuplicate) null else projects.firstOrNull { it.name == of.parentName }

    fun project(name: String): Project? = projects.firstOrNull { it.name == name }

    fun serviceRunning(project: String, service: String): Boolean =
        project(project)?.liveServiceNames?.contains(service) ?: false
}
