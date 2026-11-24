package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * One entry of an agent tab's conversation, as the Mac reads it from the transcript
 * the agent keeps (PROTOCOL.md, An agent's conversation). [id] stays the same while
 * the entry changes: a tool call that finishes.
 */
data class ConversationItem(val id: String, val kind: Kind) {
    sealed interface Kind {
        data class Prompt(val text: String, val images: Int) : Kind
        data class Text(val text: String) : Kind
        data class Tool(val tool: ConversationTool) : Kind
        data class Notice(val text: String) : Kind
    }

    val tool: ConversationTool? get() = (kind as? Kind.Tool)?.tool
    val isPrompt: Boolean get() = kind is Kind.Prompt

    companion object {
        fun parse(o: JsonObject): ConversationItem? {
            val id = o.string("id")?.takeIf { it.isNotEmpty() } ?: return null
            val text = o.string("text").orEmpty()
            val kind = when (o.string("kind")) {
                "prompt" -> Kind.Prompt(text, o.int("images") ?: 0)
                "text" -> Kind.Text(text)
                "tool" -> Kind.Tool(ConversationTool.parse(o))
                "notice" -> Kind.Notice(text)
                else -> return null
            }
            return ConversationItem(id, kind)
        }
    }
}

/** One thing the agent did, worded by the Mac to read as a line. */
data class ConversationTool(
    val what: String,
    val verb: String,
    val subject: String,
    /** The subject is a name or a command rather than words. */
    val code: Boolean,
    /** The file it was about, to open. */
    val path: String,
    val added: Int?,
    val removed: Int?,
    val note: String,
    val state: State
) {
    enum class State { Running, Done, Failed }

    val isRead: Boolean get() = what == "read"

    /** Reading or searching: a run of these folds into one line. */
    val isLookup: Boolean get() = isRead || what == "search"

    companion object {
        fun parse(o: JsonObject): ConversationTool = ConversationTool(
            what = o.string("what").orEmpty(),
            verb = o.string("verb").orEmpty(),
            subject = o.string("subject").orEmpty(),
            code = o.bool("code") ?: false,
            path = o.string("path").orEmpty(),
            added = o.int("added"),
            removed = o.int("removed"),
            note = o.string("note").orEmpty(),
            state = when (o.string("state")) {
                "running" -> State.Running
                "failed" -> State.Failed
                else -> State.Done
            }
        )
    }
}

/** What a tool call was given or what came back, under its opened line. */
data class ConversationPart(val label: String, val style: Style, val text: String) {
    enum class Style { Code, Diff, Markdown }

    companion object {
        fun parse(o: JsonObject): ConversationPart = ConversationPart(
            label = o.string("label").orEmpty(),
            style = when (o.string("style")) {
                "diff" -> Style.Diff
                "markdown" -> Style.Markdown
                else -> Style.Code
            },
            text = o.string("text").orEmpty()
        )
    }
}

/**
 * The conversation as it's drawn: each entry its own row, but for a run of reads and
 * searches, which is one.
 */
sealed interface ConversationRow {
    val id: String

    data class Entry(val item: ConversationItem) : ConversationRow {
        override val id: String get() = item.id
    }

    data class Lookups(val items: List<ConversationItem>) : ConversationRow {
        override val id: String get() = "lookups:" + items.first().id

        private val calls: List<ConversationTool> get() = items.mapNotNull { it.tool }
        val reads: Int get() = calls.count { it.isRead }
        val searches: Int get() = calls.count { !it.isRead }
        val failed: Boolean get() = calls.any { it.state == ConversationTool.State.Failed }

        /** The last call, while it has no result yet. */
        val running: ConversationTool?
            get() = calls.lastOrNull()?.takeIf { it.state == ConversationTool.State.Running }
    }

    companion object {
        fun rows(items: List<ConversationItem>): List<ConversationRow> = buildList {
            val run = mutableListOf<ConversationItem>()
            fun flush() {
                if (run.size > 1) add(Lookups(run.toList())) else run.forEach { add(Entry(it)) }
                run.clear()
            }
            for (item in items) {
                if (item.tool?.isLookup == true) {
                    run += item
                } else {
                    flush()
                    add(Entry(item))
                }
            }
            flush()
        }
    }
}

/** What the Mac pushes of a watched conversation. */
data class ConversationUpdate(
    val id: String,
    /** The newest entries rather than what changed since. */
    val reset: Boolean,
    val items: List<ConversationItem>,
    val more: Boolean,
    val error: String?
) {
    companion object {
        fun parse(o: JsonObject): ConversationUpdate = ConversationUpdate(
            id = o.string("id").orEmpty(),
            reset = o.bool("reset") ?: false,
            items = o.objects("items").orEmpty().mapNotNull(ConversationItem::parse),
            more = o.bool("more") ?: false,
            error = if (o.bool("ok") == true) {
                null
            } else {
                o.string("error") ?: "Couldn't read the conversation."
            }
        )
    }
}

/** The entries before one, oldest first. */
data class ConversationPage(val items: List<ConversationItem>, val more: Boolean) {
    companion object {
        fun parse(o: JsonObject): ConversationPage = ConversationPage(
            items = o.objects("items").orEmpty().mapNotNull(ConversationItem::parse),
            more = o.bool("more") ?: false
        )
    }
}

/** What an agent tab's screen shows, from its "…" menu's View. */
enum class TerminalViewMode(val id: String) {
    Terminal("terminal"),
    Conversation("conversation");

    companion object {
        fun of(id: String?): TerminalViewMode = entries.firstOrNull { it.id == id } ?: Terminal
    }
}

/** The view an agent tab shows now, and picking another. */
class TerminalViewChoice(val mode: TerminalViewMode, val onPick: (TerminalViewMode) -> Unit)
