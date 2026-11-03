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
    val argumentHint: String
) {
    val ref: CommandRef get() = CommandRef(scope, folder, name)

    companion object {
        fun parse(o: JsonObject): LpmCommand = LpmCommand(
            name = o.string("name").orEmpty(),
            folder = o.string("folder"),
            description = o.string("description").orEmpty(),
            body = o.string("body").orEmpty(),
            scope = CommandScope.parse(o.string("scope")) ?: CommandScope.Global,
            argumentHint = o.string("argumentHint").orEmpty()
        )
    }
}

/** One list: every folder (empty ones too, sorted ignoring case) and its commands. */
data class LpmCommandList(
    val folders: List<String> = emptyList(),
    val commands: List<LpmCommand> = emptyList()
) {
    fun inFolder(folder: String?): List<LpmCommand> = commands.filter { it.folder == folder }

    companion object {
        fun parse(o: JsonObject): LpmCommandList = LpmCommandList(
            folders = o.strings("folders").orEmpty(),
            commands = o.list("commands", LpmCommand::parse)
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
val AUTO_COMMAND_VARIABLES = listOf("branch", "project")

private val COMMAND_NAME = Regex("^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
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
