package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/**
 * A project action the phone can run (mirrors the Rust ActionInfo). `name` may be
 * a composite `parent:child` path; `children` nest into submenus. A leaf (no
 * children) is runnable; a node with children is a menu.
 */
data class Action(
    val name: String,
    val label: String,
    val emoji: String,
    // terminal | command | background | ""
    val type: String,
    val display: String,
    // The layer of the zone `display` names; empty means its first.
    val layer: String,
    val position: Double?,
    // The desktop's button color: a named accent ("cyan", "claude-deep") or a hex.
    val color: String,
    // A group's split-button child: a child key, or "last-used".
    val primary: String,
    // A group's own command: its split button's face runs it. Empty on a plain menu.
    val cmd: String,
    // Show a confirmation before running (destructive/irreversible commands).
    val confirm: Boolean,
    // User-supplied values substituted into the command as {{key}} before running.
    val inputs: List<ActionInput>,
    val children: List<Action>,
    // The task for the agent `cmd` opens, submitted once it's ready.
    val prompt: String = ""
) {
    val id: String get() = name
    val isRunnable: Boolean get() = children.isEmpty()

    /** All runnable leaves under this action, depth-first (itself if it's a leaf). */
    val runnableLeaves: List<Action> get() = if (isRunnable) {
        listOf(this)
    } else {
        children.flatMap {
            it.runnableLeaves
        }
    }

    /**
     * Non-terminal actions (background or the default headless type) run on the Mac
     * and stream their logs back for the phone to poll; terminal/command actions
     * relay to the Mac's terminal flow.
     */
    val runsInBackground: Boolean get() = type != "terminal" && type != "command"

    /** The child's own name, without its `parent:` path. */
    val childKey: String get() = name.split(':').lastOrNull { it.isNotEmpty() } ?: name

    /**
     * The child a split button runs: the one `primary` names (or the [remembered] one for
     * `last-used`), else the first runnable child. Null without `primary`.
     */
    fun primaryChild(remembered: String?): Action? {
        if (primary.isEmpty()) return null
        val target = if (primary == LAST_USED) remembered else primary
        return children.firstOrNull { target != null && it.childKey == target }
            ?: children.firstOrNull { it.isRunnable }
    }

    /**
     * What this `last-used` group remembers when [child], one of its own, runs from it,
     * as the desktop does; null for any other group.
     */
    fun lastUsedKey(child: Action): String? =
        child.childKey.takeIf { primary == LAST_USED && children.any { it.id == child.id } }

    companion object {
        /** A group's `primary` that runs whichever child ran last. */
        const val LAST_USED = "last-used"

        fun parse(o: JsonObject): Action {
            val name = o.string("name").orEmpty()
            return Action(
                name = name,
                label = o.string("label").orEmpty().ifEmpty { name },
                emoji = o.string("emoji").orEmpty(),
                type = o.string("type").orEmpty(),
                display = o.string("display").orEmpty(),
                layer = o.string("layer").orEmpty(),
                position = o.number("position"),
                color = o.string("color").orEmpty(),
                primary = o.string("primary").orEmpty(),
                cmd = o.string("cmd").orEmpty(),
                confirm = o.bool("confirm") ?: false,
                inputs = o.list("inputs", ActionInput::parse),
                children = o.list("children", Action::parse),
                prompt = o.string("prompt").orEmpty()
            )
        }
    }
}

/**
 * One declared input for an action (mirrors the Rust ActionInputInfo). `key` names
 * the `{{key}}` token substituted into the command.
 */
data class ActionInput(
    val key: String,
    val label: String,
    // "text" | "radio" | "password" (the Mac's input kinds)
    val type: String,
    val required: Boolean,
    val placeholder: String,
    val defaultValue: String,
    val options: List<ActionInputOption>
) {
    val id: String get() = key
    val isSelect: Boolean get() = (type == "radio" || type == "select") && options.isNotEmpty()
    val isSecret: Boolean get() = type == "password"

    companion object {
        fun parse(o: JsonObject): ActionInput {
            val key = o.string("key").orEmpty()
            return ActionInput(
                key = key,
                label = o.string("label").orEmpty().ifEmpty { key },
                type = o.string("type").orEmpty(),
                required = o.bool("required") ?: false,
                placeholder = o.string("placeholder").orEmpty(),
                defaultValue = o.string("default").orEmpty(),
                options = o.list("options", ActionInputOption::parse)
            )
        }
    }
}

data class ActionInputOption(val label: String, val value: String) {
    val id: String get() = value

    companion object {
        fun parse(o: JsonObject): ActionInputOption {
            val value = o.string("value").orEmpty()
            return ActionInputOption(
                label = o.string("label").orEmpty().ifEmpty {
                    value
                },
                value = value
            )
        }
    }
}

/**
 * A background action run's live output + terminal status, polled from the Mac
 * (mirrors the Rust BgRunSnapshot).
 */
data class ActionBgOutput(
    val runId: String,
    val project: String,
    val label: String,
    val startedAt: Long,
    val text: String,
    val running: Boolean,
    val success: Boolean,
    val error: String
) {
    companion object {
        fun parse(o: JsonObject?): ActionBgOutput? = o?.let {
            ActionBgOutput(
                runId = it.string("runId").orEmpty(),
                project = it.string("project").orEmpty(),
                label = it.string("label").orEmpty(),
                startedAt = it.long("startedAt") ?: 0,
                text = it.string("text").orEmpty(),
                running = it.bool("running") ?: false,
                success = it.bool("success") ?: false,
                error = it.string("error").orEmpty()
            )
        }
    }
}

/**
 * What the phone knows about a background run at start time (before its first
 * poll returns), so the run is listable/openable immediately.
 */
data class BackgroundRunInfo(
    val runId: String,
    val project: String,
    val label: String,
    val startedAt: Long
) {
    val id: String get() = runId
}

/** A background run summary from the `backgroundRuns` list (for reconnect re-attach). */
data class BackgroundRunSummary(
    val runId: String,
    val label: String,
    val startedAt: Long,
    val running: Boolean,
    val success: Boolean,
    val error: String
) {
    val id: String get() = runId

    companion object {
        fun parse(o: JsonObject): BackgroundRunSummary = BackgroundRunSummary(
            runId = o.string("runId").orEmpty(),
            label = o.string("label").orEmpty(),
            startedAt = o.long("startedAt") ?: 0,
            running = o.bool("running") ?: false,
            success = o.bool("success") ?: false,
            error = o.string("error").orEmpty()
        )
    }
}

/**
 * A framed group of buttons in the header or footer row (mirrors the Rust
 * ZoneInfo). Placement only: an action joins it with `display: <name>`, and one of
 * its layers with `layer:`.
 */
data class Zone(
    val name: String,
    val label: String,
    val rows: Int,
    val isFooter: Boolean,
    val position: Double?,
    val layers: List<ZoneLayer>,
    val collapsed: Boolean,
    /** The file that declares it: project | repo | global. */
    val source: String
) {
    val id: String get() = name

    /** The layer an action's `layer` puts it in: the one it names, else the first. */
    fun layer(named: String): String? {
        val first = layers.firstOrNull() ?: return null
        return layers.firstOrNull { it.name == named }?.name ?: first.name
    }

    companion object {
        fun parse(o: JsonObject): Zone {
            val name = o.string("name").orEmpty()
            return Zone(
                name = name,
                label = o.string("label").orEmpty().ifEmpty { name },
                rows = (o.int("rows") ?: 1).coerceIn(1, 3),
                isFooter = o.string("display") == "footer",
                position = o.number("position"),
                layers = o.list("layers", ZoneLayer::parse),
                collapsed = o.bool("collapsed") ?: false,
                source = o.string("source") ?: "project"
            )
        }
    }
}

/** A named sub-group of a zone (mirrors the Rust LayerInfo). */
data class ZoneLayer(
    val name: String,
    /** Empty when the config gives it none. */
    val label: String,
    val position: Double?
) {
    val id: String get() = name

    /** A layer without a label is named by its place in the zone. */
    fun title(index: Int): String = label.ifEmpty { "Layer ${index + 1}" }

    companion object {
        fun parse(o: JsonObject): ZoneLayer = ZoneLayer(
            name = o.string("name").orEmpty(),
            label = o.string("label").orEmpty(),
            position = o.number("position")
        )
    }
}
