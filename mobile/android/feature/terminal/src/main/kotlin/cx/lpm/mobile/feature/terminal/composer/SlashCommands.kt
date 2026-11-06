package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SlashCommand

private const val MOST_USED_ROWS = 5

/** A row's identity: an lpm command and an agent's can share a name in the Mac's reply. */
internal val SlashCommand.key: String get() = "$source:${scope?.wire.orEmpty()}:$name"

private val byName: Comparator<SlashCommand> = compareBy { it.name.lowercase() }

private val byUse: Comparator<SlashCommand> =
    compareByDescending<SlashCommand> { it.recentRuns }
        .thenByDescending { it.lastRunAt }
        .then(byName)

/**
 * What a lone "/" lists, like the desktop's menu: the commands run most in the last 30
 * days, then every other one A–Z, so nothing depends on who made it.
 */
private fun List<SlashCommand>.browseOrder(): List<SlashCommand> {
    val top = filter { it.recentRuns > 0 }.sortedWith(byUse).take(MOST_USED_ROWS)
    val keys = top.mapTo(HashSet()) { it.key }
    return top.map { it.copy(mostUsed = true) } + filterNot { it.key in keys }.sortedWith(byName)
}

/** How well the row matches a typed fragment, best first; null when it doesn't. */
private fun SlashCommand.matchRank(q: String): Int? {
    val n = name.lowercase()
    return when {
        n == q -> 0
        n.startsWith(q) -> 1
        n.split('-', ':', '_').any { it.startsWith(q) } -> 2
        folder?.lowercase()?.startsWith(q) == true -> 3
        q in n -> 4
        q in description.lowercase() -> 5
        else -> null
    }
}

/**
 * The rows a typed fragment keeps, like the desktop's filter: best match first, and
 * among equal matches the one run most. A lone "/" keeps every row.
 */
internal fun List<SlashCommand>.matching(fragment: String): List<SlashCommand> {
    val q = fragment.lowercase()
    if (q.isEmpty()) return browseOrder()
    return mapNotNull { c -> c.matchRank(q)?.let { c to it } }
        .sortedWith(
            compareBy<Pair<SlashCommand, Int>> { it.second }
                .thenByDescending { it.first.recentRuns }
                .thenBy { it.first.name.lowercase() }
        )
        .map { it.first }
}

/**
 * A row's tag, like the desktop's menu: a skill's folder (its last level), else its list.
 * The agent's own commands have none, so the tags pick out what the user keeps.
 */
internal fun SlashCommand.tag(thisProject: String, global: String): String? {
    folder?.substringAfterLast('/')?.takeIf { it.isNotEmpty() }?.let { return it }
    return when (source) {
        SlashCommand.LPM_SOURCE -> if (scope == CommandScope.Project) thisProject else global
        "project" -> thisProject
        "user" -> global
        else -> null
    }
}
