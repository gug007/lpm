package cx.lpm.mobile.feature.widgets

import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.AgentWidgetRow
import cx.lpm.mobile.core.model.Project

private const val TAB_LIMIT = 3

/** One entry of the app icon's long-press menu, on the Mac [serverId] names. */
internal sealed interface AppShortcut {
    val id: String
    val serverId: String?
    val project: String

    /** An agent tab: [title] over "<project> · <state>". */
    data class Tab(
        override val serverId: String?,
        override val project: String,
        val terminalId: String,
        val title: String,
        val subtitle: String,
        val state: AgentState
    ) : AppShortcut {
        override val id: String get() = "terminal/$project/$terminalId"
    }

    /** New Tab in the project last opened, [projectLabel] as the list shows it. */
    data class NewTab(
        override val serverId: String?,
        override val project: String,
        val projectLabel: String
    ) : AppShortcut {
        override val id: String get() = "newTab"
    }
}

/**
 * The app icon's long-press menu (iOS `AppShortcuts.items`): the live Mac's three agent
 * tabs that most want a look, then New Tab in [newTabIn] when there is one. [label]
 * gives a project's name as the list shows it.
 */
internal fun appShortcuts(
    rows: List<AgentWidgetRow>,
    serverId: String?,
    newTabIn: Project?,
    label: (String) -> String
): List<AppShortcut> {
    val tabs = appShortcutTabs(rows).mapNotNull { row ->
        row.terminalId?.let { terminal ->
            AppShortcut.Tab(
                serverId = serverId,
                project = row.project,
                terminalId = terminal,
                title = row.title,
                subtitle = "${label(row.project)} · ${row.state.label}",
                state = row.state
            )
        }
    }
    val newTab = newTabIn?.let { AppShortcut.NewTab(serverId, it.name, label(it.name)) }
    return tabs + listOfNotNull(newTab)
}

/**
 * Tabs with a terminal, waiting first, then the most recently busy, each tab once, the
 * first three.
 */
internal fun appShortcutTabs(rows: List<AgentWidgetRow>): List<AgentWidgetRow> {
    val seen = HashSet<Pair<String, String?>>()
    return rows
        .filter { it.terminalId != null }
        .sortedWith(
            compareBy<AgentWidgetRow> { it.state.rank }.thenByDescending { it.since ?: 0L }
        )
        .filter { seen.add(it.project to it.terminalId) }
        .take(TAB_LIMIT)
}
