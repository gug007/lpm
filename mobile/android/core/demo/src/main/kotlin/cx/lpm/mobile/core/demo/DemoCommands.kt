package cx.lpm.mobile.core.demo

private class DemoCommandError(override val message: String) : Exception(message)

private val COMMAND_VERBS = listOf(
    "lpmCommands",
    "lpmCommandSave",
    "lpmCommandDelete",
    "lpmCommandFolder",
    "lpmCommandExpand"
)
private const val FORBIDDEN_FOLDER_CHARS = "/\\:*?\"<>|"
private val COMMAND_NAME = Regex("^(?=.{1,64}\$)[a-z0-9]+(-[a-z0-9]+)*\$")

/**
 * Demo handlers for lpm commands, by the rules the Mac keeps (lpm_commands.rs): one
 * name per list whatever its case, folders that stay when emptied, a deleted folder's
 * commands moved to No folder, and a project's own command ahead of a global one of
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
    val reply: MutableMap<String, Any?> = try {
        commandsReply(verb, project, o).toMutableMap().apply { put("ok", true) }
    } catch (e: DemoCommandError) {
        mutableMapOf("ok" to false, "error" to e.message)
    }
    reply["t"] = verb
    reply["project"] = project
    if (o.containsKey("reqId")) reply["reqId"] = o["reqId"]
    pushAfter(0.2, reply)
    val changed = reply["ok"] == true && verb != "lpmCommands" && verb != "lpmCommandExpand"
    if (changed) {
        pushAfter(
            0.2,
            mapOf("t" to "lpmCommandsChanged", "project" to if (touchesGlobal(o)) "" else project)
        )
    }
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

private fun DemoServer.updateCommands(
    project: String,
    scope: String,
    change: (DemoCommandList) -> Unit
) {
    val list = commands(project, scope).copy()
    change(list)
    if (scope == "global") world.commandsGlobal = list else world.commandsByProject[project] = list
}

private fun DemoServer.commandLists(project: String): Dict = mapOf(
    "global" to wireCommands(world.commandsGlobal, "global"),
    "project" to ownCommands(project)?.let { wireCommands(it, "project") },
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

private fun wireCommands(list: DemoCommandList, scope: String): Dict = mapOf(
    "folders" to list.folders.sortedBy { it.lowercase() },
    "commands" to sortedCommands(list.commands).map { c ->
        mapOf(
            "name" to c.name,
            "folder" to c.folder,
            "description" to c.description,
            "body" to c.body,
            "scope" to scope,
            "argumentHint" to commandArgumentHint(c.body)
        )
    }
)

/** By folder, No folder last, then by name. */
private fun sortedCommands(commands: List<DemoCommand>): List<DemoCommand> = commands.sortedWith(
    compareBy({ it.folder == null }, { it.folder?.lowercase() }, { it.name.lowercase() })
)

private fun commandScope(o: Dict): String = if (o.string("scope") ==
    "global"
) {
    "global"
} else {
    "project"
}

private fun placeLabel(folder: String?): String = folder?.let { "the $it folder" } ?: "No folder"

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
    if (prev != null) {
        updateCommands(project, prev.first) { list ->
            list.commands.removeAll { it.folder == prev.second && it.name == prev.third }
        }
    }
    updateCommands(project, scope) { list ->
        var place = folder
        if (folder != null) {
            val existing = list.folders.firstOrNull { it.lowercase() == folder.lowercase() }
            if (existing != null) place = existing else list.folders += folder
        }
        val description = (input.string("description") ?: "").trimmingWhitespacesAndNewlines()
        list.commands += DemoCommand(name, place, description, body)
    }
}

private fun DemoServer.changeFolder(project: String, o: Dict) {
    val name = checkFolder(o.string("name") ?: "")
    val existing = { list: DemoCommandList, folder: String ->
        list.folders.firstOrNull { it.lowercase() == folder.lowercase() }
    }
    updateCommands(project, commandScope(o)) { list ->
        when (o.string("op")) {
            "create" -> {
                if (existing(list, name) != null) {
                    throw DemoCommandError("A folder named $name already exists.")
                }
                list.folders += name
            }

            "rename" -> renameFolder(list, name, checkFolder(o.string("newName") ?: ""), existing)

            "delete" -> deleteFolder(list, existing(list, name) ?: return@updateCommands)

            else -> throw DemoCommandError("unknown folder op")
        }
    }
}

private fun renameFolder(
    list: DemoCommandList,
    name: String,
    to: String,
    existing: (DemoCommandList, String) -> String?
) {
    if (name == to) return
    val current = existing(list, name) ?: throw DemoCommandError("The $name folder is gone.")
    if (name.lowercase() != to.lowercase() && existing(list, to) != null) {
        throw DemoCommandError("A folder named $to already exists.")
    }
    list.folders.replaceAll { if (it == current) to else it }
    list.commands.forEach { if (it.folder == current) it.folder = to }
}

private fun deleteFolder(list: DemoCommandList, current: String) {
    for (c in list.commands.filter { it.folder == current }) {
        val other = list.commands.firstOrNull {
            it.folder != current && it.name.lowercase() == c.name.lowercase()
        }
        if (other != null) {
            throw DemoCommandError(
                "/${other.name} is also in ${placeLabel(other.folder)}; rename one of them first."
            )
        }
    }
    list.folders.removeAll { it == current }
    list.commands.forEach { if (it.folder == current) it.folder = null }
}

private fun cleanFolder(raw: String?): String? {
    val f = raw?.trimmingWhitespacesAndNewlines()?.takeIf { it.isNotEmpty() } ?: return null
    return checkFolder(f)
}

private fun checkFolder(raw: String): String {
    val f = raw.trimmingWhitespacesAndNewlines()
    if (f.isEmpty()) throw DemoCommandError("Give the folder a name.")
    val control = f.any {
        val type = Character.getType(it).toByte()
        type == Character.CONTROL || type == Character.FORMAT
    }
    if (f.graphemeCount() > 64 || f.startsWith(".") || control ||
        f.any { it in FORBIDDEN_FOLDER_CHARS }
    ) {
        throw DemoCommandError(
            "A folder name can't start with a dot or hold any of $FORBIDDEN_FOLDER_CHARS."
        )
    }
    return f
}

// running

private fun DemoServer.expandCommand(
    project: String,
    name: String,
    args: String
): Pair<String, List<String>> {
    val key = name.dropWhile { it == '/' }.lowercase()
    val (command, scope) = effectiveCommands(project).firstOrNull {
        it.first.name.lowercase() == key
    }
        ?: throw DemoCommandError("/$name isn't one of your skills.")
    val known = world.projects.firstOrNull { it.name == project }
    val list = if (scope == "project") {
        "/Users/demo/dev/$project/.agents/skills"
    } else {
        "/Users/demo/.agents/skills"
    }
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
