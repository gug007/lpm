package cx.lpm.mobile.feature.projects.list

import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.LinkStatusLine
import cx.lpm.mobile.core.data.link.MacReach
import cx.lpm.mobile.core.data.link.QueuedAction
import cx.lpm.mobile.core.data.machines.MachineSection
import cx.lpm.mobile.core.data.projects.DuplicateProgress
import cx.lpm.mobile.core.data.projects.PendingAgentArchive
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.SidebarItem
import cx.lpm.mobile.core.data.projects.SidebarRow
import cx.lpm.mobile.core.data.projects.archivingAgentKeys
import cx.lpm.mobile.core.data.projects.sidebarItems
import cx.lpm.mobile.core.model.DuplicateOptions
import cx.lpm.mobile.core.model.FoldedAgents
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.ProjectFolder
import cx.lpm.mobile.core.model.WorkStatusChoice
import cx.lpm.mobile.core.model.foldSeenAgents
import cx.lpm.mobile.core.model.projectAgentList
import cx.lpm.mobile.core.model.projectAgentRows
import java.time.Instant

data class ProjectsUiState(
    val title: MacTitleState = MacTitleState(),
    val macs: List<MacChoice> = emptyList(),
    val demoMode: Boolean = false,
    val rows: List<ProjectsListRow> = emptyList(),
    /** No projects at all: something takes the list's place. */
    val listIsEmpty: Boolean = true,
    /** False until the first list arrives: a skeleton, not "No projects". */
    val loaded: Boolean = false,
    /** A connection problem worth showing in place of an empty list. */
    val issue: ConnectionIssue? = null,
    /** When the saved list on screen was last live, once a reconnect drags on. */
    val listAge: Instant? = null,
    /**
     * The Mac is up but refuses this phone ([RepairFooter.mac] names it): there's
     * nothing to wait for until it's paired again.
     */
    val repairFooter: RepairFooter? = null,
    val folders: List<ProjectFolder> = emptyList(),
    val duplicateDefaults: DuplicateOptions = DuplicateOptions(),
    val duplicateProgress: DuplicateProgress? = null,
    val badge: MoreBadge = MoreBadge.None,
    val automationsUnread: Int = 0,
    val workStatusMenu: List<WorkStatusChoice> = emptyList(),
    /** Agents archived here, held back behind Undo for a few seconds. */
    val pendingArchive: PendingAgentArchive? = null
)

data class RepairFooter(val device: String, val mac: String)

/** The title: the active Mac's name over how the phone reaches it. */
data class MacTitleState(
    val name: String = "Mac",
    val status: LinkStatusLine = LinkStatusLine("", LinkStatusLine.Tone.Waiting),
    /** "2 waiting" or "Details" after the status words. */
    val detail: MacTitleDetail? = null,
    /** The status line opens the connection details, except in Demo Mode. */
    val opensDetails: Boolean = true
)

sealed interface MacTitleDetail {
    data class Waiting(val count: Int) : MacTitleDetail

    data object Details : MacTitleDetail
}

/** One saved Mac in the switcher, and whether it answers right now. */
data class MacChoice(
    val id: String,
    val name: String,
    val active: Boolean,
    val linuxHost: Boolean,
    val status: MacStatus
)

sealed interface MacStatus {
    /** The live Mac: its own status line. */
    data class Live(val text: String) : MacStatus

    data class Reach(val reach: MacReach?, val lastConnected: Instant?) : MacStatus
}

/** The dot on the "…" button: an agent waiting outranks automations with news. */
enum class MoreBadge { None, NeedsYou, Problem, Automations }

/**
 * One row of the projects list: a project (with its terminal deck), a folder, or one
 * of the live Mac's machines with its projects under it.
 */
sealed interface ProjectsListRow {
    val key: String

    data class ProjectEntry(
        val project: Project,
        val indented: Boolean,
        val pending: Boolean,
        val stale: Boolean,
        val queued: List<QueuedAction>,
        val agents: List<ProjectAgentRow>,
        /** The folder it sits in, so its menu can skip that one and offer "No folder". */
        val folderId: String?,
        /** How many seen agents fold into the line under [agents]; 0 for no line. */
        val foldedSeen: Int = 0,
        val seenExpanded: Boolean = false,
        /** The Mac archives agents: a finished one swipes to archive and marks unread once seen. */
        val archivable: Boolean = false,
        /** The Mac keeps finished agents as seen once opened, so a new one can be marked seen. */
        val keepsFinished: Boolean = false
    ) : ProjectsListRow {
        override val key: String get() = "p:" + project.name
    }

    data class FolderEntry(val folder: ProjectFolder, val count: Int, val expanded: Boolean) :
        ProjectsListRow {
        override val key: String get() = "g:" + folder.id
    }

    /** A machine's header: which machine it is and whether it is on this phone yet. */
    data class MachineEntry(
        val slug: String,
        val name: String,
        val linuxHost: Boolean,
        val detail: MachineDetail?,
        /** How many projects it has; null when the Mac didn't list them. */
        val count: Int?,
        /** A Mac too old to list a machine's projects still gets you there: "Open". */
        val opensOnlyBySwitching: Boolean,
        val canOpen: Boolean,
        val expanded: Boolean
    ) : ProjectsListRow {
        override val key: String get() = "m:$slug"
    }

    /** A machine's project, opened in a session of its own while this Mac stays live. */
    data class MachineProjectEntry(
        val slug: String,
        val project: Project,
        val agents: List<ProjectAgentRow>,
        val canOpen: Boolean,
        val stale: Boolean
    ) : ProjectsListRow {
        override val key: String get() = "m:$slug/" + project.name
    }
}

/** The line under a machine's name. */
sealed interface MachineDetail {
    data object OpensThroughMac : MachineDetail

    data object Adding : MachineDetail

    data class Failed(val message: String) : MachineDetail

    data object NotOnPhone : MachineDetail

    data object Revoked : MachineDetail

    data object NeedsUpdate : MachineDetail
}

/** What the list rows are built from besides the projects themselves. */
data class RowInputs(
    val terminalTitles: Map<String, Map<String, String>> = emptyMap(),
    val queued: List<QueuedAction> = emptyList(),
    val stale: Boolean = false,
    /**
     * Folder id (or `m:<slug>` for a machine, `s:<project>` for a project's folded seen
     * agents) → open or shut, where toggled on this phone.
     */
    val expanded: Map<String, Boolean> = emptyMap(),
    val now: Long = 0,
    /** The live Mac's connected machines, each at its `peer:` slot. */
    val machines: List<MachineSection> = emptyList(),
    val activeMacId: String? = null,
    /** The Mac archives agents and lists the seen ones it keeps. */
    val archivable: Boolean = false
)

/**
 * The projects list, arranged like the desktop sidebar: folders (open unless the
 * Mac saved them collapsed or the user shut them here) with their members indented,
 * each project followed by the agents it has going.
 */
fun ProjectsState.listRows(inputs: RowInputs): List<ProjectsListRow> {
    val folderOf = groups.flatMap { g -> g.members.map { it to g.id } }.toMap()
    fun entry(row: SidebarRow, indented: Boolean): ProjectsListRow.ProjectEntry {
        val name = row.project.name
        val titles = inputs.terminalTitles[name].orEmpty()
        val expanded = inputs.expanded["s:$name"] == true
        val agents = if (inputs.archivable) {
            val listed = projectAgentList(row.project, inputs.now, titles, archivingAgentKeys(name))
            foldSeenAgents(listed, seenAgentsShown, expanded)
        } else {
            FoldedAgents(projectAgentRows(row.project, inputs.now, titles), 0)
        }
        return ProjectsListRow.ProjectEntry(
            project = row.project,
            indented = indented,
            pending = name in pendingRun,
            stale = inputs.stale,
            queued = inputs.queued.filter { it.project == name },
            agents = agents.rows,
            folderId = folderOf[name],
            foldedSeen = agents.folded,
            seenExpanded = expanded,
            archivable = inputs.archivable,
            keepsFinished = inputs.archivable && keepFinishedAgents
        )
    }
    val machines = inputs.machines.associateBy { it.id }
    return sidebarItems(inputs.machines.map { it.id }).flatMap { item ->
        when (item) {
            is SidebarItem.ProjectItem -> listOf(entry(item.row, indented = false))

            is SidebarItem.Folder -> {
                val open = inputs.expanded[item.folder.id] ?: !item.folder.collapsed
                val header = ProjectsListRow.FolderEntry(
                    folder = item.folder,
                    count = item.rows.count { !it.isChild },
                    expanded = open
                )
                listOf(header) +
                    if (open) item.rows.map { entry(it, indented = true) } else emptyList()
            }

            is SidebarItem.Machine -> machines[item.slug]?.let {
                machineListRows(it, inputs)
            }.orEmpty()
        }
    }
}
