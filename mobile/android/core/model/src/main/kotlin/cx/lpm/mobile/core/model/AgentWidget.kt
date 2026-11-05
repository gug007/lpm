package cx.lpm.mobile.core.model

import kotlinx.serialization.Serializable

/**
 * One agent tab as the Agents widget lists it (iOS `AgentWidgetRow`): what the tab
 * is called, what its agent is doing, and what its reading counts from — the same
 * fields the projects list's agent rows read.
 */
@Serializable
data class AgentWidgetRow(
    val project: String,
    /** The status entry key, unique within its project. */
    val key: String,
    val terminalId: String? = null,
    val title: String,
    val state: AgentState,
    /** Millis the reading counts from; null when the turn was never seen starting. */
    val since: Long? = null,
    /** Millis the turn ended, freezing a done row at how long the work took. */
    val until: Long? = null
) {
    fun elapsed(now: Long): String? = since?.let { shortDuration((until ?: now) - it) }
}

/** One saved Mac's agents, as the app last saw them live or a push since told. */
@Serializable
data class AgentWidgetMac(
    /** The Mac's server id, or its local id for a Mac too old to send one. */
    val id: String,
    val rows: List<AgentWidgetRow>,
    /** The Mac's name as the phone shows it; null until the app has seen it live. */
    val name: String? = null,
    /** Millis the phone last heard this Mac's agents. */
    val seenAt: Long? = null
)

/** A row and the Mac it runs on, in the order the widget lists them. */
data class AgentWidgetItem(val macId: String, val row: AgentWidgetRow)

/** The live Mac's agents as the widget lists them: one row per tab, as the projects list. */
fun agentWidgetRows(
    projects: List<Project>,
    terminalTitles: Map<String, Map<String, String>>,
    now: Long
): List<AgentWidgetRow> = projects.flatMap { project ->
    projectAgentRows(project, now, terminalTitles[project.name].orEmpty())
        .filter { it.state != AgentState.Idle }
        .map {
            AgentWidgetRow(
                project = project.name,
                key = it.id,
                terminalId = it.terminalId,
                title = it.title,
                state = it.state,
                since = it.since,
                until = it.until
            )
        }
}

/** Every Mac's agents, most urgent first and the longest at it first within a state. */
fun agentWidgetItems(macs: List<AgentWidgetMac>): List<AgentWidgetItem> =
    macs.flatMap { mac -> mac.rows.map { AgentWidgetItem(mac.id, it) } }
        .sortedWith(
            compareBy<AgentWidgetItem>(
                { it.row.state.rank },
                { it.row.since ?: Long.MAX_VALUE },
                { it.macId },
                { it.row.project },
                { it.row.key }
            )
        )

/**
 * Whether the widget's readings move with the clock: a time still counting, or a
 * quiet list saying how long ago it was updated.
 */
fun agentWidgetTicks(macs: List<AgentWidgetMac>): Boolean {
    val items = agentWidgetItems(macs)
    return items.any { it.row.since != null && it.row.until == null } ||
        (items.isEmpty() && macs.any { it.seenAt != null })
}
