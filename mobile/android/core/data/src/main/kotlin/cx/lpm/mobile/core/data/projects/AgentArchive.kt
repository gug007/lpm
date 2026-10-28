package cx.lpm.mobile.core.data.projects

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.archiveStatus
import cx.lpm.mobile.core.data.client.markStatusSeen
import cx.lpm.mobile.core.data.client.markStatusUnread
import cx.lpm.mobile.core.data.terminals.UNDO_CLOSE_MS
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.ProjectAgentRow
import cx.lpm.mobile.core.model.StatusEntry
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * Seen and archived agents (`agentArchive`): a finished agent stays listed, gray once
 * it has been opened, until it's archived.
 */

/**
 * Agents archived on this phone that can still be undone: hidden here, not yet
 * archived on the Mac. Archiving another while the bar is up joins this one.
 */
data class PendingAgentArchive(val agents: List<Agent>) {
    data class Agent(val project: String, val keys: List<String>, val title: String)
}

/** The Mac archives agents and lists the seen ones it keeps. */
val ProjectsStore.canArchiveAgents: Boolean
    get() = client?.hostFeatures?.contains(LpmClient.AGENT_ARCHIVE_FEATURE) == true

/** The status keys of [project] an archive waiting on its undo hides. */
fun ProjectsState.archivingAgentKeys(project: String): Set<String> =
    pendingAgentArchive?.agents.orEmpty()
        .filter { it.project == project }
        .flatMap { it.keys }
        .toSet()

/**
 * Archive a finished agent's row. It leaves the list at once but reaches the Mac only
 * once the undo window passes, which another archive restarts.
 */
fun ProjectsStore.archiveAgent(row: ProjectAgentRow, project: String) {
    if (!canArchiveAgents || !row.state.isFinished) return
    pendingAgentArchiveJob?.cancel()
    val agents = state.value.pendingAgentArchive?.agents.orEmpty()
    setPendingAgentArchive(
        PendingAgentArchive(agents + PendingAgentArchive.Agent(project, row.keys, row.title))
    )
    pendingAgentArchiveJob = session.scope.launch {
        delay(UNDO_CLOSE_MS)
        pendingAgentArchiveJob = null
        finishPendingAgentArchive()
    }
}

fun ProjectsStore.undoAgentArchive() {
    takePendingAgentArchive()
}

/**
 * Send an archive still waiting on its undo now. Its rows leave the list for good
 * here too, so they can't flash back before status-changed lands.
 */
fun ProjectsStore.finishPendingAgentArchive() {
    val pending = takePendingAgentArchive() ?: return
    for ((project, agents) in pending.agents.groupBy { it.project }) {
        val keys = agents.flatMap { it.keys }
        val archived = { entry: StatusEntry ->
            entry.key in keys && AgentState.of(entry.value).isFinished
        }
        updateProject(project) {
            it.withStatus(it.statusEntries.filterNot(archived), it.seenEntries.filterNot(archived))
        }
        client?.archiveStatus(project, keys)
    }
}

/**
 * Mark a finished row seen without opening it. Only offered while the Mac keeps
 * finished agents; otherwise the Mac archives it.
 */
fun ProjectsStore.markAgentSeen(row: ProjectAgentRow, project: String) {
    if (!canArchiveAgents) return
    settleAgentStatus(project) { it.key in row.keys && AgentState.of(it.value).isFinished }
    client?.markStatusSeen(project, row.keys)
}

/** Take a seen row back to new. No notification comes for it again. */
fun ProjectsStore.markAgentUnread(row: ProjectAgentRow, project: String) {
    if (!canArchiveAgents) return
    updateProject(project) { p ->
        val unread = p.seenEntries.filter { it.key in row.keys }
        p.withStatus(
            p.statusEntries + unread.map { it.copy(seenAt = 0) },
            p.seenEntries.filterNot { it.key in row.keys }
        )
    }
    client?.markStatusUnread(project, row.keys)
}

/**
 * Take finished statuses off a project's list as the Mac is about to: into its seen
 * agents when it keeps finished agents, else gone.
 */
internal fun ProjectsStore.settleAgentStatus(project: String, settles: (StatusEntry) -> Boolean) {
    val now = session.env.clock.millis()
    val keepsSeen = canArchiveAgents && state.value.keepFinishedAgents
    updateProject(project) { p ->
        val settled = p.statusEntries.filter(settles)
        p.withStatus(
            p.statusEntries.filterNot(settles),
            if (keepsSeen) p.seenEntries + settled.map { it.copy(seenAt = now) } else p.seenEntries
        )
    }
}

private fun ProjectsStore.takePendingAgentArchive(): PendingAgentArchive? {
    pendingAgentArchiveJob?.cancel()
    pendingAgentArchiveJob = null
    val pending = state.value.pendingAgentArchive
    setPendingAgentArchive(null)
    return pending
}
