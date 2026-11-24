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
        val entries = if (asked.startsWith("/")) {
            demoOutside(asked)?.entries
        } else {
            demoListing(project, asked.trim('/'))
        }
        val reply = mutableMapOf<String, Any?>(
            "t" to "listDir",
            "project" to project,
            "dir" to asked
        )
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
    register("locatePath") { o ->
        val project = o.string("project") ?: return@register
        val typed = o.string("path") ?: return@register
        val reply = mutableMapOf<String, Any?>(
            "t" to "locatePath",
            "project" to project,
            "path" to typed
        )
        if (world.project(project)?.isRemote == true) {
            reply["ok"] = false
            reply["error"] = "Files on an SSH host open on your Mac."
        } else {
            reply["ok"] = true
            reply += demoLocated(project, typed)
        }
        pushAfter(0.15, reply)
    }
}

private fun DemoServer.demoLocated(project: String, typed: String): Dict {
    val root = "/Users/demo/dev/$project"
    val full = when {
        typed.startsWith("~/") -> "/Users/demo/" + typed.drop(2)
        typed.startsWith("/") -> typed
        else -> "$root/$typed"
    }
    val parts = mutableListOf<String>()
    for (part in full.split('/')) {
        when (part) {
            "", "." -> Unit
            ".." -> parts.removeLastOrNull()
            else -> parts += part
        }
    }
    val path = "/" + parts.joinToString("/")
    if (path != root && !path.startsWith("$root/")) {
        return mapOf("kind" to (demoOutside(path)?.kind ?: "missing"), "at" to path)
    }
    val rel = path.drop(root.length + 1)
    val tree = demoTree(project)
    val kind = when (rel) {
        in tree.files -> "file"
        in tree.dirs -> "dir"
        else -> "missing"
    }
    return mapOf("kind" to kind, "at" to path, "rel" to rel)
}

private const val DEV = "/Users/demo/dev"

/** What is at a path outside the project; only a folder has entries. */
private class DemoOutside(val kind: String, val entries: List<Dict>? = null)

/** Every project is in [DEV]: outside one there are the others, and the folders that hold them. */
private fun DemoServer.demoOutside(path: String): DemoOutside? {
    val names = world.projects.filterNot { it.isRemote }.map { it.name }
    val name = names.firstOrNull { "$path/".startsWith("$DEV/$it/") }
    if (name != null) {
        val rel = path.drop("$DEV/$name/".length)
        if (rel in demoTree(name).files) return DemoOutside("file")
        val rows = demoListing(name, rel) ?: return null
        return DemoOutside(
            "dir",
            rows.map { mapOf("name" to it["name"], "dir" to it["dir"], "ignored" to false) }
        )
    }
    val prefix = if (path.endsWith("/")) path else "$path/"
    val inside = names.map { "$DEV/$it" }
        .filter { it.startsWith(prefix) }
        .map { it.drop(prefix.length).substringBefore('/') }
        .distinct()
        .sorted()
    if (inside.isEmpty()) return null
    return DemoOutside("dir", inside.map { mapOf("name" to it, "dir" to true, "ignored" to false) })
}

private class DemoTree(val dirs: Set<String>, val files: Set<String>, val ignored: List<String>)

private fun parentOf(path: String): String = path.substringBeforeLast('/', "")

private fun nameOf(path: String): String = path.substringAfterLast('/')

private fun DemoServer.demoTree(project: String): DemoTree {
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
    return DemoTree(dirs, files, ignored)
}

private fun DemoServer.demoListing(project: String, dir: String): List<Dict>? {
    val changes = world.git[project]?.files.orEmpty()
    val tree = demoTree(project)
    val dirs = tree.dirs
    val files = tree.files
    val ignored = tree.ignored
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
