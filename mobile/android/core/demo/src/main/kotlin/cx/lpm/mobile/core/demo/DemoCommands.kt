package cx.lpm.mobile.core.demo

internal class DemoCommandError(override val message: String) : Exception(message)

private val COMMAND_VERBS = listOf(
    "lpmCommands",
    "lpmCommandSave",
    "lpmCommandDelete",
    "lpmCommandFolder",
    "lpmCommandExpand",
    "lpmCommandOtherFolder",
    "lpmCommandConvert"
)
private val COMMAND_NAME = Regex("^(?=.{1,64}\$)[a-z0-9]+(-[a-z0-9]+)*\$")

/**
 * Demo handlers for lpm commands, by the rules the Mac keeps (lpm_commands.rs): one
 * name per list whatever its case, folders that stay when emptied, folders that are
 * paths and take what's inside them along, a deleted folder's contents moved up a
 * level, and a project's own command ahead of a global one of
 * the same name.
 */
internal fun DemoServer.registerCommandsHandlers() {
    for (verb in COMMAND_VERBS) register(verb) { o -> answerCommands(verb, o) }
}

/**
 * The `/` menu's lpm rows for a project's terminal: this project's commands, then the
 * global ones whose name it doesn't already use.
 */
internal fun DemoServer.demoCommandSlashRows(project: String): List<Dict> =
    effectiveCommands(project).map { (c, scope) ->
        mapOf(
            "name" to c.name,
            "description" to c.description,
            "argumentHint" to commandArgumentHint(c.body),
            "source" to "lpm",
            "folder" to c.folder,
            "scope" to scope
        )
    }

private fun DemoServer.answerCommands(verb: String, o: Dict) {
    val project = o.string("project") ?: ""
    // A run counts against its skill's list, so the change it pushes names that list.
    val ranScope = if (verb == "lpmCommandExpand") {
        effectiveCommand(project, o.string("name") ?: "")?.second
    } else {
        null
    }
    val reply: MutableMap<String, Any?> = try {
        commandsReply(verb, project, o).toMutableMap().apply { put("ok", true) }
    } catch (e: DemoCommandError) {
        mutableMapOf("ok" to false, "error" to e.message)
    }
    reply["t"] = verb
    reply["project"] = project
    if (o.containsKey("reqId")) reply["reqId"] = o["reqId"]
    pushAfter(0.2, reply)
    if (reply["ok"] != true || verb == "lpmCommands") return
    val global = if (verb == "lpmCommandExpand") ranScope == "global" else touchesGlobal(o)
    pushAfter(0.2, mapOf("t" to "lpmCommandsChanged", "project" to if (global) "" else project))
}

/** A change to the global list, which every project shows, names no project in its push. */
private fun touchesGlobal(o: Dict): Boolean =
    listOf(o, o.dict("command"), o.dict("previous"), o.dict("target"))
        .any { it?.string("scope") == "global" }

private fun DemoServer.commandsReply(verb: String, project: String, o: Dict): Dict {
    when (verb) {
        "lpmCommands" -> Unit

        "lpmCommandExpand" -> {
            val (text, missing) =
                expandCommand(project, o.string("name") ?: "", o.string("args") ?: "")
            return mapOf("text" to text, "missing" to missing)
        }

        "lpmCommandSave" -> saveCommand(
            project,
            o.dict("command") ?: emptyMap(),
            o.dict("previous")
        )

        "lpmCommandDelete" -> {
            val target = o.dict("target") ?: emptyMap()
            val folder = target.string("folder")
            val name = target.string("name") ?: ""
            updateCommands(project, commandScope(target)) { list ->
                list.commands.removeAll { it.folder == folder && it.name == name }
            }
        }

        "lpmCommandOtherFolder" -> moveOther(project, o)

        "lpmCommandConvert" -> convertSkill(project, o)

        else -> changeFolder(project, o)
    }
    return mapOf("lists" to commandLists(project))
}

// lists

private fun DemoServer.ownCommands(project: String): DemoCommandList? =
    if (world.projects.any { it.name == project }) {
        world.commandsByProject[project] ?: projectCommandsSeed()
    } else {
        null
    }

private fun DemoServer.commands(project: String, scope: String): DemoCommandList {
    if (scope == "global") return world.commandsGlobal
    return ownCommands(project) ?: throw DemoCommandError("This terminal isn't in a project.")
}

internal fun DemoServer.updateCommands(
    project: String,
    scope: String,
    change: (DemoCommandList) -> Unit
) {
    val list = commands(project, scope).copy()
    change(list)
    if (scope == "global") world.commandsGlobal = list else world.commandsByProject[project] = list
}

private fun DemoServer.commandLists(project: String): Dict = mapOf(
    "global" to wireCommands(world.commandsGlobal, "global", project, nowMillis()),
    "project" to ownCommands(project)?.let { wireCommands(it, "project", project, nowMillis()) },
    "projectError" to null
)

private fun DemoServer.effectiveCommands(project: String): List<Pair<DemoCommand, String>> {
    val own = ownCommands(project)?.let { list ->
        sortedCommands(list.commands).map { it to "project" }
    }.orEmpty()
    val global = sortedCommands(world.commandsGlobal.commands).map { it to "global" }
    val seen = mutableSetOf<String>()
    return (own + global).filter { seen.add(it.first.name.lowercase()) }
}

private fun DemoServer.effectiveCommand(project: String, name: String): Pair<DemoCommand, String>? {
    val key = name.dropWhile { it == '/' }.lowercase()
    return effectiveCommands(project).firstOrNull { it.first.name.lowercase() == key }
}

private fun skillsDir(scope: String, project: String): String = if (scope == "project") {
    "/Users/demo/dev/$project/.agents/skills"
} else {
    "/Users/demo/.agents/skills"
}

private fun wireCommands(list: DemoCommandList, scope: String, project: String, now: Long): Dict =
    mapOf(
        "inRepo" to (scope == "project"),
        "others" to list.others.sortedBy { it.name.lowercase() }.map { o ->
            mapOf(
                "name" to o.name,
                "description" to o.description,
                "preview" to o.preview,
                "agents" to o.agents,
                "path" to o.path.replace("{root}", "/Users/demo/dev/$project"),
                "folder" to o.folder
            ) + if (o.atRoot) mapOf("atRoot" to true) else emptyMap()
        },
        "folders" to list.folders.sortedBy(::folderOrder),
        "commands" to sortedCommands(list.commands).map { c ->
            mapOf(
                "name" to c.name,
                "folder" to c.folder,
                "description" to c.description,
                "body" to c.body,
                "scope" to scope,
                "argumentHint" to commandArgumentHint(c.body),
                "keptOutOfGit" to c.keptOutOfGit,
                "tracked" to (scope == "project" && c.tracked),
                "path" to "${skillsDir(scope, project)}/${c.name}/SKILL.md"
            ) + if (c.runs > 0) {
                mapOf("runs" to c.runs, "lastRunAt" to (c.lastRunAt ?: (now - (c.ranAgo ?: 0))))
            } else {
                emptyMap()
            }
        }
    )

/** By folder, No folder last, then by name. */
private fun sortedCommands(commands: List<DemoCommand>): List<DemoCommand> = commands.sortedWith(
    compareBy({ it.folder == null }, { it.folder?.let(::folderOrder) }, { it.name.lowercase() })
)

internal fun commandScope(o: Dict): String = if (o.string("scope") ==
    "global"
) {
    "global"
} else {
    "project"
}

internal fun placeLabel(folder: String?): String = folder?.let { "the $it folder" } ?: "No folder"

// changes

private fun DemoServer.saveCommand(project: String, input: Dict, previous: Dict?) {
    val name = input.string("name") ?: ""
    if (!COMMAND_NAME.matches(name)) {
        throw DemoCommandError("Use lowercase letters, numbers and single hyphens for the name.")
    }
    val body = (input.string("body") ?: "").trimmingWhitespacesAndNewlines()
    if (body.isEmpty()) throw DemoCommandError("Write the prompt first.")
    val scope = commandScope(input)
    val folder = cleanFolder(input.string("folder"))
    val prev = previous?.let {
        Triple(commandScope(it), it.string("folder"), it.string("name") ?: "")
    }
    val isPrevious = { c: DemoCommand ->
        prev?.let { it.first == scope && it.second == c.folder && it.third == c.name } ?: false
    }
    val clash = commands(project, scope).commands.firstOrNull {
        it.name.lowercase() == name.lowercase() && !isPrevious(it)
    }
    if (clash != null) {
        throw DemoCommandError("/${clash.name} already exists in ${placeLabel(clash.folder)}.")
    }
    val before = prev?.let { p ->
        commands(project, p.first).commands.firstOrNull {
            it.folder == p.second && it.name == p.third
        }
    }
    val stays = prev?.first == scope
    val keptOut = scope == "project" &&
        (input.bool("keepOutOfGit") ?: (stays && before?.keptOutOfGit == true))
    if (prev != null) {
        updateCommands(project, prev.first) { list ->
            list.commands.removeAll { it.folder == prev.second && it.name == prev.third }
        }
    }
    updateCommands(project, scope) { list ->
        val place = folder?.let { addFolder(list.folders, it) }
        val description = (input.string("description") ?: "").trimmingWhitespacesAndNewlines()
        list.commands += DemoCommand(
            name,
            place,
            description,
            body,
            keptOutOfGit = keptOut,
            tracked = !keptOut && stays && before?.tracked == true,
            runs = before?.runs ?: 0,
            lastRunAt = before?.lastRunAt,
            ranAgo = before?.ranAgo
        )
    }
}

private fun DemoServer.moveOther(project: String, o: Dict) {
    val name = o.string("name") ?: ""
    val folder = cleanFolder(o.string("folder"))
    updateCommands(project, commandScope(o)) { list ->
        val other = list.others.firstOrNull { it.name == name }
            ?: throw DemoCommandError("/$name isn't in this list any more.")
        val kept = folder?.let { addFolder(list.folders, it) }
        other.folder = kept
        other.atRoot = kept == null && o.bool("root") == true
    }
}

private fun DemoServer.convertSkill(project: String, o: Dict) {
    val name = o.string("name") ?: ""
    val scope = commandScope(o)
    val root = if (scope == "global") "/Users/demo" else "{root}"
    updateCommands(project, scope) { list ->
        if (o["toLpm"] == true) {
            val other = list.others.firstOrNull { it.name == name }
                ?: throw DemoCommandError("/$name isn't in this list any more.")
            list.others -= other
            list.commands += DemoCommand(other.name, other.folder, other.description, other.preview)
        } else {
            val c = list.commands.firstOrNull { it.name == name }
                ?: throw DemoCommandError("/$name isn't in this list any more.")
            list.commands -= c
            list.others += DemoOther(
                c.name,
                c.description,
                c.body,
                listOf("claude", "codex", "gemini", "opencode"),
                "$root/.agents/skills/${c.name}/SKILL.md",
                c.folder
            )
        }
    }
}

// running

/** Counted the way the Mac counts a run (lpm_commands_usage.rs). */
private fun DemoServer.recordRun(project: String, command: DemoCommand, scope: String) {
    updateCommands(project, scope) { list ->
        val ran = list.commands.firstOrNull { it.name == command.name } ?: return@updateCommands
        ran.runs += 1
        ran.lastRunAt = nowMillis()
        ran.ranAgo = null
    }
}

private fun DemoServer.expandCommand(
    project: String,
    name: String,
    args: String
): Pair<String, List<String>> {
    val (command, scope) = effectiveCommand(project, name)
        ?: throw DemoCommandError("/$name isn't one of your skills.")
    recordRun(project, command, scope)
    val known = world.projects.firstOrNull { it.name == project }
    val list = skillsDir(scope, project)
    val auto: Map<String, String> = known?.let {
        mapOf(
            "branch" to (world.git[project]?.branch ?: "main"),
            "project" to it.label.ifEmpty { it.name }
        )
    }.orEmpty() + ("dir" to "$list/${command.name}")
    val given = args.trimmingWhitespacesAndNewlines()
    val asks = commandVariables(command.body).filter { it !in AUTO_VARIABLES }
    val values = positionalArguments(given, asks.size)
    val missing = mutableListOf<String>()
    var text = replaceCommandVariables(command.body) { variable ->
        val value = if (variable in AUTO_VARIABLES) {
            auto[variable]
        } else {
            asks.indexOf(variable).takeIf { it >= 0 }?.let { values.getOrNull(it) }
        }
        if (value == null && variable !in missing) missing += variable
        value
    }
    val takesAll = "\$ARGUMENTS" in text
    text = text.replace("\$ARGUMENTS", given)
    if (given.isNotEmpty() && asks.isEmpty() && !takesAll) {
        text = text.trimEnd { it.isWhitespace() } + "\n\n" + given
    }
    return text to missing
}
