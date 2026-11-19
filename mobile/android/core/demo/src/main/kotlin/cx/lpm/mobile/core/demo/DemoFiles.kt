package cx.lpm.mobile.core.demo

/*
 * Demo handler for Files (iOS `DemoFiles`): each project's folders, built from the
 * same tree its @-mention index lists, with the demo's git changes marked, plus the
 * folders git ignores (which the index leaves out).
 */

internal fun DemoServer.registerFilesHandlers() {
    register("listDir") { o ->
        val project = o.string("project") ?: return@register
        val asked = o.string("dir").orEmpty()
        val dir = asked.trim('/')
        val reply = mutableMapOf<String, Any?>(
            "t" to "listDir",
            "project" to project,
            "dir" to asked
        )
        val entries = demoListing(project, dir)
        when {
            world.project(project)?.isRemote == true -> {
                reply["ok"] = false
                reply["error"] = "Files on an SSH host open on your Mac."
            }

            entries != null -> {
                reply["ok"] = true
                reply["entries"] = entries
                reply["root"] = "/Users/demo/dev/$project"
            }

            else -> {
                reply["ok"] = false
                reply["error"] = "That folder isn't there anymore."
            }
        }
        pushAfter(0.25, reply)
    }
}

private fun parentOf(path: String): String = path.substringBeforeLast('/', "")

private fun nameOf(path: String): String = path.substringAfterLast('/')

private fun DemoServer.demoListing(project: String, dir: String): List<Dict>? {
    val dirs = mutableSetOf("")
    val files = mutableSetOf<String>()
    val changes = world.git[project]?.files.orEmpty()
    fun addParents(path: String) {
        var parent = parentOf(path)
        while (parent.isNotEmpty()) {
            dirs += parent
            parent = parentOf(parent)
        }
    }
    val tree = mentionTree(project)
    for ((path, isDir) in tree) {
        if (isDir) dirs += path else files += path
        addParents(path)
    }
    for (change in changes) {
        if (change.status == "deleted") continue
        files += change.path
        addParents(change.path)
    }
    val ignored = ignoredTree(tree)
    for (path in ignored) {
        dirs += path
        addParents(path)
    }
    if (dir !in dirs) return null
    val byName = compareBy<String, String>(String.CASE_INSENSITIVE_ORDER) { nameOf(it) }
    val folderRows = dirs.filter {
        it.isNotEmpty() && parentOf(it) == dir
    }.sortedWith(byName).map { path ->
        val row = mutableMapOf<String, Any?>(
            "name" to nameOf(path),
            "dir" to true,
            "ignored" to ignored.any { path == it || path.startsWith("$it/") }
        )
        val below = changes.count { it.path.startsWith("$path/") }
        if (below > 0) row["changed"] = below
        row
    }
    val fileRows = files.filter { parentOf(it) == dir }.sortedWith(byName).map { path ->
        val row = mutableMapOf<String, Any?>(
            "name" to nameOf(path),
            "dir" to false,
            "ignored" to false
        )
        changes.firstOrNull { it.path == path }?.let { row["status"] = it.status }
        row
    }
    return folderRows + fileRows
}

/** What a JS project's .gitignore keeps out of the index but a folder listing still shows. */
private fun ignoredTree(tree: List<Pair<String, Boolean>>): List<String> {
    if (tree.none { it.first == "package.json" }) return emptyList()
    val paths =
        mutableListOf(
            "node_modules",
            "node_modules/react",
            "node_modules/react-dom",
            "node_modules/typescript"
        )
    if (tree.any { it.first == "next.config.mjs" }) paths += listOf(".next", "node_modules/next")
    return paths
}
