package cx.lpm.mobile.feature.terminal.composer

import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.ServiceInfo
import cx.lpm.mobile.core.model.SlashCommand

// What the text at the end of the field is asking for, like the desktop's
// SLASH_TRIGGER and MENTION_TRIGGER anchored to a caret at the end.

/**
 * The "/fragment" being typed at the end — anywhere in the prompt, not just at its
 * start. The "/" follows whitespace or the start (so "src/app" never triggers) and
 * the fragment holds no whitespace.
 */
internal fun slashQuery(text: String): String? {
    val slash = text.lastIndexOf('/')
    if (slash < 0) return null
    if (slash > 0 && !text[slash - 1].isWhitespace()) return null
    val fragment = text.substring(slash + 1)
    return fragment.takeIf { f -> f.none { it.isWhitespace() } }
}

internal fun slashMatches(text: String, commands: List<SlashCommand>): List<SlashCommand> {
    val query = slashQuery(text) ?: return emptyList()
    return commands.matching(query)
}

/** After a fully typed "/command " (one trailing space), the hint drawn dimmed after the caret. */
internal fun slashArgumentHint(text: String, commands: List<SlashCommand>): String? {
    if (!text.endsWith(" ")) return null
    val head = text.dropLast(1)
    val slash = head.lastIndexOf('/')
    if (slash < 0) return null
    if (slash > 0 && !head[slash - 1].isWhitespace()) return null
    val name = head.substring(slash + 1)
    if (name.isEmpty() || name.any { it.isWhitespace() }) return null
    return commands.firstOrNull { it.name == name }?.argumentHint?.takeIf { it.isNotEmpty() }
}

/** The "@fragment" being typed at the end; the "@" follows whitespace or the start. */
internal fun mentionQuery(text: String): String? {
    val at = text.lastIndexOf('@')
    if (at < 0) return null
    if (at > 0 && !text[at - 1].isWhitespace()) return null
    val fragment = text.substring(at + 1)
    return fragment.takeIf { f -> f.none { it.isWhitespace() || it == '@' } }
}

/** The @-mention menu's rows for a fragment: files (changes first), branches, running services. */
data class MentionResults(
    val changed: List<MentionEntry> = emptyList(),
    val files: List<MentionEntry> = emptyList(),
    val branches: List<GitBranch> = emptyList(),
    val services: List<ServiceInfo> = emptyList()
) {
    val isEmpty: Boolean get() = changed.isEmpty() && files.isEmpty() && branches.isEmpty() &&
        services.isEmpty()
}

private const val MENTION_FILES = 50
private const val MENTION_BRANCHES = 20

internal fun mentionResults(
    query: String,
    entries: List<MentionEntry>,
    branches: List<GitBranch>,
    services: List<ServiceInfo>
): MentionResults {
    val hits = if (query.isEmpty()) {
        entries
    } else {
        entries.filter {
            it.path.contains(query, ignoreCase = true)
        }
    }
    val shown = hits.take(MENTION_FILES)
    val running = services.filter { it.running && it.paneIndex != null }
    return MentionResults(
        changed = shown.filter { it.changed },
        files = shown.filterNot { it.changed },
        // Branches only surface once a fragment is typed, as on the desktop.
        branches = if (query.isEmpty()) {
            emptyList()
        } else {
            branches.filter { it.name.contains(query, ignoreCase = true) }.take(MENTION_BRANCHES)
        },
        services = if (query.isEmpty()) {
            running
        } else {
            running.filter {
                it.name.contains(query, ignoreCase = true)
            }
        }
    )
}

/** Text up to the last `marker`, then `replacement` — completing a "/" or "@" fragment. */
internal fun replacingFragment(text: String, marker: Char, replacement: String): String {
    val index = text.lastIndexOf(marker)
    return (if (index < 0) "" else text.substring(0, index)) + replacement
}

/** Park an invocation after whatever is typed, with exactly one space between. */
internal fun joined(existing: String, invocation: String): String {
    val head = existing.trim()
    return if (head.isEmpty()) invocation else "$head $invocation"
}

/** A context block injected inline: a labeled fenced snippet. */
internal fun contextBlock(label: String, content: String): String =
    "\n\n$label:\n```\n${content.trim()}\n```\n"
