package cx.lpm.mobile.feature.projects.detail

import cx.lpm.mobile.core.data.link.LinkStatusLine
import cx.lpm.mobile.core.data.link.QueuedAction
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.terminals.PendingTabClose
import cx.lpm.mobile.core.data.tips.firstOpen
import cx.lpm.mobile.core.model.AppTip
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.Service
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.agentRowsByTerminal
import cx.lpm.mobile.core.model.crashedServices
import cx.lpm.mobile.core.model.endedServices
import cx.lpm.mobile.core.model.isUp
import cx.lpm.mobile.core.model.liveServiceNames
import cx.lpm.mobile.core.model.projectAgentRows

/** One terminal tab and what the agent in it reports (null for a plain shell). */
data class TabEntry(val terminal: TerminalInfo, val agent: ProjectAgentRow?)

/**
 * One configured service, whether it runs, and whether a toggle is out for it.
 * [ended] says how it ended while its pane is still open; null when it runs or never
 * started.
 */
data class ServiceEntry(
    val service: Service,
    val running: Boolean,
    val pending: Boolean,
    val ended: Service? = null
)

/** The line over the title: the project's state, or the link's while it's down. */
sealed interface DetailSubtitle {
    data object Running : DetailSubtitle

    data object Stopped : DetailSubtitle

    data object InvalidConfiguration : DetailSubtitle

    /** Started services that crashed, named with how ("web exited with code 1"). */
    data class Crashed(val services: List<Service>) : DetailSubtitle

    data class Link(val line: LinkStatusLine) : DetailSubtitle
}

data class ProjectDetailUiState(
    val project: Project? = null,
    /** The status a person set leads the name, as in the projects list. */
    val title: String = "",
    val subtitle: DetailSubtitle? = null,
    /** The working tree's changes, under the title. */
    val git: GitSnapshot? = null,
    val gitLoading: Boolean = false,
    /** How the branch stands on CI, from a Mac that answers `gitChecks`. */
    val checks: GitChecks? = null,
    /** The Mac answers (or it's the demo). */
    val live: Boolean = true,
    /** Starts, stops and runs tapped while the Mac was away, waiting for it. */
    val queued: List<QueuedAction> = emptyList(),
    /** Null until the tab list loads: a skeleton, not "No Terminals". */
    val tabs: List<TabEntry>? = null,
    /** A new tab is on its way: a placeholder row, and New tab waits. */
    val creating: Boolean = false,
    val services: List<ServiceEntry> = emptyList(),
    /** The Mac restarts and stops services outright (`serviceRestart`). */
    val canStopServices: Boolean = false,
    /** A Start/Stop is out for the whole project: Stop all waits. */
    val stopping: Boolean = false,
    /** The project has background runs listed under its services. */
    val hasBackgroundRuns: Boolean = false,
    /** The Mac starts agents in new tabs, so New tab asks what the tab starts with. */
    val canLaunchAgents: Boolean = false,
    /** The Mac takes the tab menu's fork / title / close-others (`tabMenu`). */
    val canUseTabMenu: Boolean = false,
    /** A tab closed here that Undo can still bring back. */
    val pendingClose: PendingTabClose? = null,
    /** The first tip this screen has something to point at, at the top of the list. */
    val tip: AppTip? = null
) {
    val runningServices: Int get() = services.count { it.running }

    /** Stop all, while the project runs. */
    val canStopAll: Boolean get() = project?.running == true

    /** Nothing to list at all: the screen offers a new terminal instead. */
    val isEmpty: Boolean
        get() = tabs != null && tabs.isEmpty() && !creating && services.isEmpty() &&
            !hasBackgroundRuns

    /** Behind "No Terminals" or the config error there's no list for usage to follow. */
    val showsUsage: Boolean get() = !isEmpty && project?.configError == null

    /** The Git section under the tabs, once they're in and the folder is a repository. */
    val showsGit: Boolean
        get() = tabs != null && !isEmpty && project?.configError == null && git?.isRepo == true

    /** The tree has uncommitted changes: the title opens them. */
    val hasChanges: Boolean get() = git?.files.orEmpty().isNotEmpty()
}

/** What the project screen reads besides the projects list. */
data class DetailInputs(
    val terminals: List<TerminalInfo>? = null,
    val creating: Boolean = false,
    val hasBackgroundRuns: Boolean = false,
    /** The Mac answers (or it's the demo): the title shows the project's state. */
    val live: Boolean = true,
    val statusLine: LinkStatusLine? = null,
    val git: GitSnapshot? = null,
    val gitLoading: Boolean = false,
    val checks: GitChecks? = null,
    val queued: List<QueuedAction> = emptyList(),
    val canStopServices: Boolean = false,
    val canLaunchAgents: Boolean = false,
    val canUseTabMenu: Boolean = false,
    val pendingClose: PendingTabClose? = null,
    val now: Long = 0,
    /** The ids of the tips closed on this phone. */
    val closedTips: Set<String> = emptySet()
)

/**
 * A project's tabs, services and title from the session's stores. A visited
 * machine's project shows as the live Mac lists it ([listed]) until the machine answers.
 */
fun ProjectsState.detail(
    name: String,
    inputs: DetailInputs,
    listed: Project? = null
): ProjectDetailUiState {
    // While the Mac is away an empty list is no answer either: lpm may be
    // restarting, and it brings the tabs back once it's up.
    val terminals = inputs.terminals?.takeIf { it.isNotEmpty() || inputs.live }
    val project =
        project(name) ?: listed ?: return ProjectDetailUiState(
            live = inputs.live,
            queued = inputs.queued,
            tabs = terminals?.map { TabEntry(it, null) },
            hasBackgroundRuns = inputs.hasBackgroundRuns,
            canLaunchAgents = inputs.canLaunchAgents,
            canUseTabMenu = inputs.canUseTabMenu,
            pendingClose = inputs.pendingClose
        )
    val agents = agentRowsByTerminal(projectAgentRows(project, inputs.now, emptyMap()))
    // One that ended keeps its place among the started services until restarted or stopped.
    val running = project.liveServiceNames
    val ended = project.endedServices
    val crashed = project.crashedServices
    val toggles = pendingServiceToggle[name].orEmpty()
    val mark = project.workStatus?.displayEmoji.orEmpty()
    return ProjectDetailUiState(
        project = project,
        title = if (mark.isEmpty()) project.label else "$mark ${project.label}",
        live = inputs.live,
        git = inputs.git,
        gitLoading = inputs.gitLoading,
        checks = inputs.checks,
        subtitle = when {
            !inputs.live && inputs.statusLine != null -> DetailSubtitle.Link(inputs.statusLine)
            project.configError != null -> DetailSubtitle.InvalidConfiguration
            crashed.isNotEmpty() -> DetailSubtitle.Crashed(crashed)
            project.isUp -> DetailSubtitle.Running
            else -> DetailSubtitle.Stopped
        },
        queued = inputs.queued,
        tabs = terminals?.map { TabEntry(it, agents[it.id]) },
        creating = inputs.creating,
        services = project.allServices.map {
            ServiceEntry(
                it,
                running = it.name in running,
                pending = it.name in toggles,
                ended = ended[it.name]
            )
        },
        canStopServices = inputs.canStopServices,
        stopping = name in pendingRun,
        hasBackgroundRuns = inputs.hasBackgroundRuns,
        canLaunchAgents = inputs.canLaunchAgents,
        canUseTabMenu = inputs.canUseTabMenu,
        pendingClose = inputs.pendingClose,
        // None until the tabs have loaded, so the actions tip doesn't flash before the tab tip.
        tip = terminals?.let { tabs ->
            inputs.closedTips.firstOpen(
                listOfNotNull(
                    AppTip.TabMenu.takeIf { tabs.isNotEmpty() },
                    AppTip.Actions.takeIf { project.actions.isNotEmpty() },
                    AppTip.Review.takeIf { inputs.git?.files.orEmpty().isNotEmpty() }
                )
            )
        }
    )
}
