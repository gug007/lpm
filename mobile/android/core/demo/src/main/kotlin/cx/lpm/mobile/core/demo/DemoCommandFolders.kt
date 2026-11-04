package cx.lpm.mobile.core.demo

private const val FORBIDDEN_FOLDER_CHARS = "\\:*?\"<>|"
private const val MAX_FOLDER_PATH_LENGTH = 255

// The demo's rules for folders, as the Mac keeps them: a folder is the path to it, each
// level is listed, and what's inside a folder moves with it (iOS `DemoCommandFolders`).

/** Sorts what's inside a folder right after it. */
internal fun folderOrder(folder: String): String = folder.lowercase().replace('/', '\u0000')

internal fun DemoServer.changeFolder(project: String, o: Dict) {
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
                addFolder(list.folders, name)
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
    if (to.lowercase().startsWith("${current.lowercase()}/")) {
        throw DemoCommandError("A folder can't move into itself.")
    }
    if (name.lowercase() != to.lowercase() && existing(list, to) != null) {
        throw DemoCommandError("A folder named $to already exists.")
    }
    moveFolder(list, current, to)
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
    moveFolder(list, current, current.substringBeforeLast('/', "").ifEmpty { null })
}

/** Lists [path] and the folders it sits inside; gives it back as the list spells it. */
internal fun addFolder(folders: MutableList<String>, path: String): String {
    var spelled = ""
    for (level in path.split('/')) {
        val next = if (spelled.isEmpty()) level else "$spelled/$level"
        spelled = folders.firstOrNull { it.lowercase() == next.lowercase() }
            ?: next.also { folders += it }
    }
    return spelled
}

/** What [folder] becomes when [from] becomes [to], null being the top of the list. */
private fun moved(folder: String?, from: String, to: String?): String? = when {
    folder == null -> null
    folder == from -> to
    !folder.startsWith("$from/") -> folder
    else -> folder.drop(from.length + 1).let { rest -> to?.let { "$it/$rest" } ?: rest }
}

private fun moveFolder(list: DemoCommandList, from: String, to: String?) {
    val folders = mutableListOf<String>()
    list.folders.forEach { folder -> moved(folder, from, to)?.let { addFolder(folders, it) } }
    list.folders.clear()
    list.folders += folders
    list.commands.forEach { it.folder = moved(it.folder, from, to) }
    list.others.forEach { it.folder = moved(it.folder, from, to) }
}

internal fun cleanFolder(raw: String?): String? {
    val f = raw?.trimmingWhitespacesAndNewlines()?.takeIf { it.isNotEmpty() } ?: return null
    return checkFolder(f)
}

private fun checkFolder(raw: String): String {
    val levels = raw.split('/').map {
        it.trimmingWhitespacesAndNewlines()
    }.filter { it.isNotEmpty() }
    if (levels.isEmpty()) throw DemoCommandError("Give the folder a name.")
    levels.forEach(::checkFolderLevel)
    val path = levels.joinToString("/")
    if (path.graphemeCount() > MAX_FOLDER_PATH_LENGTH) {
        throw DemoCommandError("Those folders are nested too deep.")
    }
    return path
}

private fun checkFolderLevel(level: String) {
    val control = level.any {
        val type = Character.getType(it).toByte()
        type == Character.CONTROL || type == Character.FORMAT
    }
    if (level.graphemeCount() > 64 || level.startsWith(".") || control ||
        level.any { it in FORBIDDEN_FOLDER_CHARS }
    ) {
        throw DemoCommandError(
            "A folder name can't start with a dot or hold any of $FORBIDDEN_FOLDER_CHARS."
        )
    }
}
