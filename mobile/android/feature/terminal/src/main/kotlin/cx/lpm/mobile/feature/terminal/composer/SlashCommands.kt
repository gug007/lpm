package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.model.CommandScope
import cx.lpm.mobile.core.model.SlashCommand

/** A row's identity: an lpm command and an agent's can share a name in the Mac's reply. */
internal val SlashCommand.key: String get() = "$source:${scope?.wire.orEmpty()}:$name"

/**
 * The rows a typed fragment keeps, like the desktop's filter: a name (or an lpm
 * command's folder) starting with it first, then a name or description holding it.
 * Rows stay together under their heading, and the heading holding the best match
 * leads; lpm commands come first here, so they win a tie.
 */
internal fun List<SlashCommand>.matching(fragment: String): List<SlashCommand> {
    val q = fragment.lowercase()
    if (q.isEmpty()) return this
    val starts = mutableListOf<SlashCommand>()
    val contains = mutableListOf<SlashCommand>()
    for (c in this) {
        val name = c.name.lowercase()
        if (name.startsWith(q) || c.folder?.lowercase()?.startsWith(q) == true) {
            starts += c
        } else if (q in name || q in c.description.lowercase()) {
            contains += c
        }
    }
    return (starts + contains).groupBy {
        if (it.isLpm) it.scope to it.folder else null
    }.values.flatten()
}

/** What the `/` menu calls an agent CLI's own commands; null for the generic heading. */
internal fun agentCommandsLabel(cli: String): String? = when (cli) {
    "claude" -> "Claude Code"
    "codex" -> "Codex"
    "gemini" -> "Gemini"
    "opencode" -> "OpenCode"
    else -> null
}

/** The heading an lpm command's group goes under: its folder and its list. */
internal fun SlashCommand.lpmGroup(noFolder: String, thisProject: String, global: String): String {
    val list = if (scope == CommandScope.Project) thisProject else global
    return "${folder ?: noFolder} · $list"
}
