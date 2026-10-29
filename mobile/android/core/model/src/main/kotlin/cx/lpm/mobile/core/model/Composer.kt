package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * One recalled message (mirrors the Rust HistoryRow). Drafts are filtered out by
 * the UI; only sent prompts are offered for recall.
 */
data class HistoryRow(
    val id: String,
    val text: String,
    val terminalLabel: String,
    val isDraft: Boolean
) {
    companion object {
        fun parse(o: JsonObject): HistoryRow = HistoryRow(
            id = o.string("id").orEmpty(),
            text = o.string("text").orEmpty(),
            terminalLabel = o.string("terminalLabel").orEmpty(),
            isDraft = o.bool("isDraft") ?: false
        )
    }
}

/**
 * One @-mention target: a project file/dir (relative path the agent resolves).
 * `changed` marks a git working-tree change, surfaced first in the menu.
 */
data class MentionEntry(val path: String, val dir: Boolean, val changed: Boolean) {
    val id: String get() = path

    companion object {
        fun parse(o: JsonObject): MentionEntry = MentionEntry(
            path = o.string("path").orEmpty(),
            dir = o.bool("dir") ?: false,
            changed = o.bool("changed") ?: false
        )
    }
}

/**
 * One slash-command autocomplete entry (mirrors the Rust AgentCommand): a CLI
 * built-in or a project/user command discovered on disk.
 */
data class SlashCommand(
    // No leading "/", e.g. "review" or "prompts:draftpr".
    val name: String,
    val description: String,
    val argumentHint: String,
    // builtin | project | user
    val source: String
) {
    val id: String get() = name

    /** Where it comes from, as the desktop's menu tags it. */
    val sourceLabel: String?
        get() = when (source) {
            "builtin" -> "built-in"
            "project", "user" -> source
            else -> null
        }

    companion object {
        fun parse(o: JsonObject): SlashCommand = SlashCommand(
            name = o.string("name").orEmpty(),
            description = o.string("description").orEmpty(),
            argumentHint = o.string("argumentHint").orEmpty(),
            source = o.string("source").orEmpty()
        )
    }
}

/**
 * One enabled composer AI action (from `~/.lpm/composer-actions.json`). `icon` is a
 * stable key the phone maps to an icon; `id` is passed back as the `transform`
 * instruction source, `label` is the menu title.
 */
data class ComposerAction(
    val id: String,
    val icon: String,
    val label: String,
    val instruction: String
) {
    companion object {
        fun parse(o: JsonObject): ComposerAction = ComposerAction(
            id = o.string("id").orEmpty(),
            icon = o.string("icon").orEmpty(),
            label = o.string("label").orEmpty(),
            instruction = o.string("instruction").orEmpty()
        )
    }
}

/**
 * One message-history row for the paged history screen. `kind` is "sent" or
 * "draft"; `at`/`seq` form the keyset cursor for the next page.
 */
data class HistoryItem(
    val id: String,
    val text: String,
    val images: Map<String, String>,
    val timestamp: Long,
    val favorite: Boolean,
    val folder: String?,
    val kind: String,
    val project: String,
    val at: Long,
    val seq: Long,
    /** The paired computer it was typed on (slug); null for the Mac's own messages. */
    val machine: String? = null,
    val machineName: String? = null
) {
    val isDraft: Boolean get() = kind == "draft"
    val isFromOtherComputer: Boolean get() = machine != null

    companion object {
        fun parse(o: JsonObject): HistoryItem = HistoryItem(
            id = o.string("id").orEmpty(),
            text = o.string("text").orEmpty(),
            images = o.stringMap("images").orEmpty(),
            timestamp = o.long("timestamp") ?: 0,
            favorite = o.bool("favorite") ?: false,
            folder = o.string("folder"),
            kind = o.string("kind") ?: "sent",
            project = o.string("project").orEmpty(),
            at = o.long("at") ?: 0,
            seq = o.long("seq") ?: 0,
            machine = o.string("machine"),
            machineName = o.string("machineName")
        )
    }
}

/** The keyset cursor `historyQuery` pages back from (Swift's `(at:, seq:, machine:)` tuple). */
data class HistoryCursor(val at: Long, val seq: Long, val machine: String? = null)

/** A message-history folder with its message count, for the history filter UI. */
data class HistoryFolder(val id: String, val name: String, val count: Int) {
    companion object {
        fun parse(o: JsonObject): HistoryFolder = HistoryFolder(
            id = o.string("id").orEmpty(),
            name = o.string("name") ?: "Folder",
            count = o.int("count") ?: 0
        )
    }
}
