package cx.lpm.mobile.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

// lpm commands: prompts saved as Markdown files on the Mac and run by typing
// `/name` in a terminal's composer. A project has its own list beside the global
// one; the shapes mirror the Rust side (lpm_commands.rs).

/** Which list a command is in: the Mac's `~/.lpm/commands/` or the project's `.lpm/commands/`. */
@Serializable
enum class CommandScope(val wire: String) {
    Project("project"),
    Global("global");

    companion object {
        fun parse(value: String?): CommandScope? = entries.firstOrNull { it.wire == value }
    }
}

/** Where a command's file is: its list, its folder (null for No folder) and its name. */
@Serializable
data class CommandRef(val scope: CommandScope, val folder: String?, val name: String)

/**
 * One command. [body] is the prompt as written, `{{…}}` and all; [argumentHint] is
 * `"<ticket> <who>"` for the variables a run asks for, `""` when it asks for none.
 */
data class LpmCommand(
    val name: String,
    val folder: String?,
    val description: String,
    val body: String,
    val scope: CommandScope,
    val argumentHint: String,
    /** Git ignores it and holds none of its files. False from a Mac on an older lpm. */
    val keptOutOfGit: Boolean = false,
    /** Git holds some of its files. False from a Mac on an older lpm. */
    val tracked: Boolean = false,
    /**
     * How often it ran on the Mac and when last (unix millis); 0 and null before its
     * first run, and from a Mac on an older lpm.
     */
    val runs: Int = 0,
    val lastRunAt: Long? = null
) {
    val ref: CommandRef get() = CommandRef(scope, folder, name)

    /**
     * "2h · 14×": how long ago it last ran and how often, as the desktop's Skills tab
     * shows it; null before its first run.
     */
    fun runsLabel(now: Long): String? {
        val at = lastRunAt ?: return null
        return if (runs > 0) "${runAge(at, now)} · $runs×" else null
    }

    companion object {
        fun parse(o: JsonObject): LpmCommand = LpmCommand(
            name = o.string("name").orEmpty(),
            folder = o.string("folder"),
            description = o.string("description").orEmpty(),
            body = o.string("body").orEmpty(),
            scope = CommandScope.parse(o.string("scope")) ?: CommandScope.Global,
            argumentHint = o.string("argumentHint").orEmpty(),
            keptOutOfGit = o.bool("keptOutOfGit") ?: false,
            tracked = o.bool("tracked") ?: false,
            runs = o.int("runs") ?: 0,
            lastRunAt = o.long("lastRunAt")
        )
    }
}

private const val MINUTE_MS = 60_000L
private const val HOUR_MS = 60 * MINUTE_MS
private const val DAY_MS = 24 * HOUR_MS

/** "now", "40m", "2h", "3d", "5mo", "2y": how long before [now] [at] was. */
fun runAge(at: Long, now: Long): String {
    val ago = maxOf(0L, now - at)
    return when {
        ago < MINUTE_MS -> "now"
        ago < HOUR_MS -> "${ago / MINUTE_MS}m"
        ago < DAY_MS -> "${ago / HOUR_MS}h"
        ago < 60 * DAY_MS -> "${ago / DAY_MS}d"
        ago < 365 * DAY_MS -> "${ago / (30 * DAY_MS)}mo"
        else -> "${ago / (365 * DAY_MS)}y"
    }
}

/** An agent lpm knows, and whether it reads a skill. */
data class AgentReach(val label: String, val reads: Boolean)

private val KNOWN_AGENTS = listOf(
    "claude" to "Claude Code",
    "codex" to "Codex",
    "gemini" to "Gemini",
    "opencode" to "OpenCode"
)

/**
 * Where an [OtherSkill] shows: a [folder], with the list's skills in no folder
 * ([root]), or with neither the Other skills group. Its file doesn't change for any.
 */
data class OtherSpot(val folder: String? = null, val root: Boolean = false)

/** A skill in a list's places that wasn't made in lpm: shown, never changed. */
data class OtherSkill(
    val name: String,
    val description: String,
    val preview: String,
    val agents: List<String>,
    val path: String,
    val folder: String? = null,
    val atRoot: Boolean = false
) {
    val reach: List<AgentReach>
        get() = KNOWN_AGENTS.map { (cli, label) -> AgentReach(label, cli in agents) }

    val spot: OtherSpot get() = OtherSpot(folder, folder == null && atRoot)

    companion object {
        fun parse(o: JsonObject): OtherSkill = OtherSkill(
            name = o.string("name").orEmpty(),
            description = o.string("description").orEmpty(),
            preview = o.string("preview").orEmpty(),
            agents = o.strings("agents").orEmpty(),
            path = o.string("path").orEmpty(),
            folder = o.string("folder"),
            atRoot = o.bool("atRoot") == true
        )
    }
}

private const val FOLDER_SEP = '/'

/** The folder holding [folder], null at the top of a list. */
fun folderParent(folder: String): String? =
    folder.substringBeforeLast(FOLDER_SEP, "").ifEmpty { null }

/** A folder's own name, without the folders it sits inside. */
fun folderLabel(folder: String): String = folder.substringAfterLast(FOLDER_SEP)

/** The folder named [name] inside [parent]. Blank stays blank, for the Mac to refuse. */
fun childFolder(parent: String?, name: String): String {
    val own = name.trim()
    return if (parent == null || own.isEmpty()) own else "$parent$FOLDER_SEP$own"
}

/** [folder] is [parent] or sits somewhere inside it. */
fun isWithinFolder(folder: String, parent: String): Boolean =
    folder == parent || folder.startsWith("$parent$FOLDER_SEP")

/**
 * One list: every folder (empty ones too, each level of one inside another, sorted
 * ignoring case; `Work/Reviews` sits inside `Work`), its commands, the
 * [others] in its places, and [inRepo] for a project's list in a git repo. A Mac on an
 * older lpm sends neither of the last two.
 */
data class LpmCommandList(
    val folders: List<String> = emptyList(),
    val commands: List<LpmCommand> = emptyList(),
    val others: List<OtherSkill> = emptyList(),
    val inRepo: Boolean = false
) {
    fun inFolder(folder: String?): List<LpmCommand> = commands.filter { it.folder == folder }

    /** The folders directly inside [parent], or at the top of the list for null. */
    fun subfolders(parent: String?): List<String> = folders.filter { folderParent(it) == parent }

    /**
     * What a row for [folder] counts: its commands and other skills, and those of the
     * folders inside it. The Other skills group has its own row, so No folder leaves it out.
     */
    fun countIn(folder: String?): Int {
        if (folder == null) return inFolder(null).size + othersIn(null).size
        val held = { f: String? -> f != null && isWithinFolder(f, folder) }
        return commands.count { held(it.folder) } + others.count { held(it.folder) }
    }

    /** The other skills shown with a folder's commands, or with the ones in no folder. */
    fun othersIn(folder: String?): List<OtherSkill> =
        others.filter { it.folder == folder && (folder != null || it.atRoot) }

    /** The other skills in neither: the Other skills group. */
    val otherGroup: List<OtherSkill> get() = others.filter { it.folder == null && !it.atRoot }

    companion object {
        fun parse(o: JsonObject): LpmCommandList = LpmCommandList(
            folders = o.strings("folders").orEmpty(),
            commands = o.list("commands", LpmCommand::parse),
            others = o.list("others", OtherSkill::parse),
            inRepo = o.bool("inRepo") ?: false
        )
    }
}

/**
 * Both lists. [project] is null outside a project, or when its list couldn't be read
 * (an SSH host that didn't answer): [projectError] says why.
 */
data class LpmCommandLists(
    val global: LpmCommandList = LpmCommandList(),
    val project: LpmCommandList? = null,
    val projectError: String? = null
) {
    fun list(scope: CommandScope): LpmCommandList? = when (scope) {
        CommandScope.Global -> global
        CommandScope.Project -> project
    }

    /** The lists a command can go in, the project's first. */
    val scopes: List<CommandScope>
        get() = if (project != null) CommandScope.entries else listOf(CommandScope.Global)

    companion object {
        fun parse(o: JsonObject): LpmCommandLists = LpmCommandLists(
            global = o.obj("global")?.let(LpmCommandList::parse) ?: LpmCommandList(),
            project = o.obj("project")?.let(LpmCommandList::parse),
            projectError = o.string("projectError")
        )
    }
}

/** A command's prompt with the arguments filled in; [missing] are still `{{name}}` in [text]. */
data class ExpandedCommand(val text: String, val missing: List<String>)

/** The `/name args` a whole message is when it may run a command. */
data class CommandRun(val name: String, val args: String)

/** The variables lpm fills in by itself. */
val AUTO_COMMAND_VARIABLES = listOf("branch", "project", "dir")

private val COMMAND_NAME = Regex("^(?=.{1,64}\$)[a-z0-9]+(-[a-z0-9]+)*\$")
private val COMMAND_RUN = Regex("^\\s*/([A-Za-z0-9][A-Za-z0-9_-]*)(?:\\s+([\\s\\S]*))?$")
private val PROMPT_VARIABLE = Regex("\\{\\{\\s*([A-Za-z0-9_-]+)\\s*\\}\\}")

fun isValidCommandName(name: String): Boolean = COMMAND_NAME.matches(name)

fun parseCommandRun(text: String): CommandRun? {
    val match = COMMAND_RUN.matchEntire(text) ?: return null
    return CommandRun(match.groupValues[1], match.groupValues[2].trim())
}

/** Each `{{name}}` in a prompt once, in order: those a run asks for and those lpm fills in. */
data class PromptVariables(val asks: List<String>, val auto: List<String>) {
    val isEmpty: Boolean get() = asks.isEmpty() && auto.isEmpty()
}

fun promptVariables(body: String): PromptVariables {
    val asks = mutableListOf<String>()
    val auto = mutableListOf<String>()
    for (match in PROMPT_VARIABLE.findAll(body)) {
        val name = match.groupValues[1]
        val bucket = if (name in AUTO_COMMAND_VARIABLES) auto else asks
        if (name !in bucket) bucket += name
    }
    return PromptVariables(asks, auto)
}
