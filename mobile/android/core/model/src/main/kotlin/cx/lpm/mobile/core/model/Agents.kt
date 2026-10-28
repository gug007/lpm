package cx.lpm.mobile.core.model

/**
 * What an agent is doing, in product words. `Idle` is the catch-all for a status
 * nothing acts on. Mirrors the desktop's agentStatus.ts.
 */
enum class AgentState(val label: String) {
    NeedsYou("Needs you"),
    Error("Problem"),
    Working("Working"),
    Done("Done"),
    Idle("Idle")
    ;

    /** Attention order; lower is more urgent. */
    val rank: Int get() = ordinal

    /** A turn that ended, well or not: what can be marked seen and archived. */
    val isFinished: Boolean get() = this == Done || this == Error

    companion object {
        /** The four status strings the Mac reports; anything else is idle. */
        fun of(value: String): AgentState = when (value) {
            "Waiting" -> NeedsYou
            "Error" -> Error
            "Running" -> Working
            "Done" -> Done
            else -> Idle
        }
    }
}

/** The whole Mac's agents rolled up, for the badge over the way into Activity. */
data class AgentAmbient(val needsYou: Int = 0, val hasError: Boolean = false) {
    val isLit: Boolean get() = needsYou > 0 || hasError
}

fun agentAmbient(projects: List<Project>): AgentAmbient {
    val states = projects.flatMap { p -> p.statusEntries.map { AgentState.of(it.value) } }
    return AgentAmbient(
        needsYou = states.count { it == AgentState.NeedsYou },
        hasError = AgentState.Error in states
    )
}

/** A project where agents are mid-task, which the restart an lpm update ends in would cut off. */
data class BusyAgentPlace(val id: String, val label: String, val count: Int)

fun busyAgentPlaces(projects: List<Project>): List<BusyAgentPlace> =
    projects.mapNotNull { project ->
        val count = project.statusEntries.count {
            AgentState.of(it.value).let { state ->
                state == AgentState.Working ||
                    state == AgentState.NeedsYou
            }
        }
        if (count > 0) BusyAgentPlace(project.name, project.label, count) else null
    }

// Status entries carry no provider field; each agent's hooks encode it in the key
// prefix (desktop src-tauri/src/agentkind.rs).
private val statusKeyAgents = listOf(
    "claude_code_" to "Claude Code",
    "codex_" to "Codex",
    "gemini_" to "Gemini CLI",
    "cursor_" to "Cursor",
    "opencode_" to "OpenCode",
    "omp_" to "omp"
)

fun agentProviderLabel(statusKey: String): String =
    statusKeyAgents.firstOrNull { statusKey.startsWith(it.first) }?.second ?: "Agent"

/**
 * One agent of a project, as the projects list shows it under the project's row.
 * Mirrors the desktop sidebar's sidebarAgents.ts.
 */
data class ProjectAgentRow(
    /** The status key, unique within its project. */
    val id: String,
    val state: AgentState,
    /**
     * What the agent's terminal tab is called. Falls back to the agent's own name
     * until that project's tabs have loaded, which is where the names come from.
     */
    val title: String,
    val provider: String,
    val terminalId: String?,
    /**
     * Millis: what the reading counts from — the turn's start for work running or
     * finished, the state's own start for a wait. Null when the turn was never seen
     * starting, so how long it ran is unknowable.
     */
    val since: Long?,
    /** Millis: set once the turn ended, freezing the reading at how long it took. */
    val until: Long?,
    /** How many further agents report on this row's tab, folded into it. */
    val shared: Int = 0,
    /**
     * Every status key the row stands for — its own, the agents folded into it and a
     * seen agent on its tab — which archiving or marking it acts on.
     */
    val keys: List<String> = emptyList(),
    /**
     * Millis: when the row was last opened, for an agent kept after that as seen
     * (`seenEntries`) and listed muted until archived. Null for the others.
     */
    val seenAt: Long? = null
) {
    val seen: Boolean get() = seenAt != null

    fun elapsed(now: Long): String? = since?.let { shortDuration((until ?: now) - it) }
}

// A paired Mac stamps its statuses with its own clock, which can run ahead of
// ours; an unstamped entry would otherwise start in 1970.
private fun stamp(value: Long, now: Long): Long? = if (value > 0) minOf(value, now) else null

/** Most urgent first, and within a state the one that entered it most recently. */
private val urgency = compareBy<StatusEntry> { AgentState.of(it.value).rank }
    .thenByDescending { it.timestamp }

/**
 * Every agent a project has going, in the order the list shows them: one row per
 * tab, as the desktop sidebar has it. The most urgent agent on a tab speaks for it
 * and the others are counted on it; an agent reporting against no tab keeps its own
 * row. `tabTitles` is that project's terminal id → the name that tab is showing.
 */
fun projectAgentRows(
    project: Project,
    now: Long,
    tabTitles: Map<String, String>
): List<ProjectAgentRow> = foldByTerminal(agentRows(project.statusEntries, now, tabTitles))

/**
 * What the projects list shows under a project from a Mac that archives agents: [projectAgentRows], then the seen agents, most recently
 * seen first and one row per tab like the rest. A seen agent on a tab that also
 * reports a status adds no row, only its key to that tab's. A finished agent whose
 * key is in [hiding] is being archived and left out.
 */
fun projectAgentList(
    project: Project,
    now: Long,
    tabTitles: Map<String, String>,
    hiding: Set<String> = emptySet()
): List<ProjectAgentRow> {
    val listed = { entry: StatusEntry ->
        !(entry.key in hiding && AgentState.of(entry.value).isFinished)
    }
    val rows = foldByTerminal(agentRows(project.statusEntries.filter(listed), now, tabTitles))
        .toMutableList()
    val unlisted = mutableListOf<StatusEntry>()
    for (entry in project.seenEntries.filter(listed)) {
        val index = rows.indexOfFirst { it.terminalId == entry.paneID }
        if (index >= 0) {
            rows[index] = rows[index].copy(keys = rows[index].keys + entry.key)
        } else {
            unlisted += entry
        }
    }
    val seen = foldByTerminal(agentRows(unlisted, now, tabTitles))
        .sortedWith(compareByDescending<ProjectAgentRow> { it.seenAt }.thenBy { it.id })
    return rows + seen
}

/** A project's agent rows once its seen rows past the Mac's limit fold into one line. */
data class FoldedAgents(
    val rows: List<ProjectAgentRow>,
    /** How many seen rows the line stands for; 0 when there is no line. */
    val folded: Int
)

/**
 * The rows a project lists once its seen rows past [shown] fold into one line.
 * Expanded, every row lists and the line offers to fold them again. Seen rows trail
 * the others, so only seen rows ever fold.
 */
fun foldSeenAgents(rows: List<ProjectAgentRow>, shown: Int, expanded: Boolean): FoldedAgents {
    val extra = rows.count { it.seen } - maxOf(shown, 0)
    if (extra <= 0) return FoldedAgents(rows, 0)
    return FoldedAgents(if (expanded) rows else rows.dropLast(extra), extra)
}

/**
 * One row per tab: the first agent on a tab speaks for it and the others are counted
 * on it. An agent reporting against no tab keeps its own row.
 */
private fun foldByTerminal(agents: List<ProjectAgentRow>): List<ProjectAgentRow> {
    val rows = mutableListOf<ProjectAgentRow>()
    val rowForTerminal = mutableMapOf<String, Int>()
    for (row in agents) {
        val terminal = row.terminalId
        val index = terminal?.let(rowForTerminal::get)
        when {
            terminal == null -> rows += row

            index != null -> rows[index] = rows[index].let {
                it.copy(
                    shared = it.shared + 1,
                    keys = it.keys + row.keys,
                    seenAt = listOfNotNull(it.seenAt, row.seenAt).maxOrNull()
                )
            }

            else -> {
                rowForTerminal[terminal] = rows.size
                rows += row
            }
        }
    }
    return rows
}

private fun agentRows(
    entries: List<StatusEntry>,
    now: Long,
    tabTitles: Map<String, String>
): List<ProjectAgentRow> = entries.sortedWith(urgency).map { entry ->
    val provider = agentProviderLabel(entry.key)
    val state = AgentState.of(entry.value)
    val stateSince = stamp(entry.timestamp, now) ?: now
    val turnStart = stamp(entry.turnStart, now)
    val tab = tabTitles[entry.paneID]
    // A finished turn reads as how long the work took, held still. Waiting and a
    // problem read as how long they have been true. Working spans a turn's approval
    // pauses, so it counts from when the agent picked the work up. Idle is nothing
    // an agent reported, so there is no turn to time.
    val (since, until) = when (state) {
        AgentState.Done -> turnStart to (stamp(entry.endedAt, now) ?: stateSince)
        AgentState.Working -> (turnStart ?: stateSince) to null
        AgentState.NeedsYou, AgentState.Error -> stateSince to null
        AgentState.Idle -> null to null
    }
    ProjectAgentRow(
        id = entry.key,
        state = state,
        title = if (tab.isNullOrEmpty()) provider else tab,
        provider = provider,
        terminalId = entry.paneID.ifEmpty { null },
        since = since,
        until = until,
        keys = listOf(entry.key),
        seenAt = entry.seenAt.takeIf { it > 0 }
    )
}

/** The agent each terminal reads as; [projectAgentRows] already holds one per tab. */
fun agentRowsByTerminal(rows: List<ProjectAgentRow>): Map<String, ProjectAgentRow> {
    val byTerminal = mutableMapOf<String, ProjectAgentRow>()
    for (row in rows) row.terminalId?.let { byTerminal.putIfAbsent(it, row) }
    return byTerminal
}

/**
 * "45s", "4m", "2h 5m": a reading rather than a stopwatch. Takes millis and rounds
 * down like a stopwatch: it says what has elapsed, never more.
 */
fun shortDuration(millis: Long): String {
    val secs = maxOf(0, millis / 1000)
    if (secs < 60) return "${secs}s"
    val mins = secs / 60
    if (mins < 60) return "${mins}m"
    val rest = mins % 60
    return if (rest > 0) "${mins / 60}h ${rest}m" else "${mins / 60}h"
}
