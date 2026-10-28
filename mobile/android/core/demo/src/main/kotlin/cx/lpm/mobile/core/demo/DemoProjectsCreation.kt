package cx.lpm.mobile.core.demo

// Project creation (add / import / clone / discovery), sidebar folder ops, and the
// project domain's cross-domain hooks and helpers.

internal fun DemoServer.registerCreationHandlers() {
    register("createProject") { o ->
        val name = o.string("name") ?: return@register
        if (name.isEmpty()) {
            push(creationError("createProject", name, "Give this project a name."))
            return@register
        }
        if (world.projectIndex(name) != null) {
            push(creationError("createProject", name, alreadyExists(name)))
            return@register
        }
        demoAddProject(name = name, copyOf = null)
        push(mapOf("t" to "createProject", "ok" to true, "name" to name))
        pushAfter(0.1) { mapOf("t" to "projects-changed") }
    }
    register("createSshProject") { o ->
        val name = o.string("name") ?: return@register
        val ssh = o.dict("ssh") ?: emptyMap()
        val host = ssh.string("host") ?: ""
        val user = ssh.string("user") ?: ""
        if (host.isEmpty() || user.isEmpty()) {
            push(creationError("createSshProject", name, "Enter the host and user to connect as."))
            return@register
        }
        if (world.projectIndex(name) != null) {
            push(creationError("createSshProject", name, alreadyExists(name)))
            return@register
        }
        world.projects.add(
            DemoWorld.Project(
                name = name,
                label = name,
                running = false,
                isRemote = true,
                services = listOf(
                    DemoWorld.Svc(
                        name = "shell",
                        cmd = "ssh $user@$host",
                        port = 0,
                        running = false
                    )
                )
            )
        )
        world.sidebarOrder.add(name)
        demoCreateTerminals(project = name, copyOf = null)
        push(mapOf("t" to "createSshProject", "ok" to true, "name" to name))
        pushAfter(0.1) { mapOf("t" to "projects-changed") }
    }
    register("cloneProject") { o ->
        val name = o.string("name") ?: return@register
        val url = (o.string("url") ?: "").trimmingWhitespacesAndNewlines()
        if (url.isEmpty()) {
            push(creationError("cloneProject", name, "Enter a repository address."))
            return@register
        }
        if (world.projectIndex(name) != null) {
            push(creationError("cloneProject", name, alreadyExists(name)))
            return@register
        }
        pushAfter(2.2) {
            if (world.projectIndex(name) != null) return@pushAfter null
            demoAddProject(name = name, copyOf = null)
            demoCloneGitState(from = "blog", to = name)
            push(mapOf("t" to "projects-changed"))
            mapOf("t" to "cloneProject", "ok" to true, "name" to name)
        }
    }
    register("listDirs") { o ->
        val path = canonicalPath(o.string("path") ?: "")
        val reply = mutableMapOf<String, Any?>(
            "t" to "listDirs",
            "ok" to true,
            "path" to path,
            "dirs" to demoDirs(path)
        )
        parentPath(path)?.let { reply["parent"] = it }
        push(reply)
    }
    register("listSshHosts") {
        push(
            mapOf(
                "t" to "listSshHosts",
                "ok" to true,
                "hosts" to listOf(
                    mapOf(
                        "name" to "dev-server",
                        "hostName" to "dev-server.local",
                        "user" to "demo",
                        "port" to 22,
                        "identityFile" to ""
                    ),
                    mapOf(
                        "name" to "staging",
                        "hostName" to "staging.internal",
                        "user" to "deploy",
                        "port" to 22,
                        "identityFile" to "~/.ssh/id_ed25519"
                    )
                )
            )
        )
    }
}

private fun creationError(t: String, name: String, error: String): Dict =
    mapOf("t" to t, "ok" to false, "name" to name, "error" to error)

private fun alreadyExists(name: String) = "A project named “$name” already exists."

private fun canonicalPath(raw: String): String {
    var p = raw.trimmingWhitespacesAndNewlines()
    if (p.isEmpty() || p == "~") return "/Users/demo"
    if (p.startsWith("~/")) p = "/Users/demo/" + p.drop(2)
    while (p.length > 1 && p.endsWith("/")) p = p.dropLast(1)
    return p
}

private fun parentPath(path: String): String? {
    if (path == "/") return null
    val up = path.swiftSplit('/').dropLast(1)
    return if (up.isEmpty()) "/" else "/" + up.joinToString("/")
}

private fun demoDirs(path: String): List<String> = when (path) {
    "/" -> listOf("Applications", "Library", "System", "Users")

    "/Users" -> listOf("Shared", "demo")

    "/Users/demo" -> listOf("Desktop", "Developer", "Documents", "Downloads", "Projects")

    "/Users/demo/Projects" -> listOf(
        "api-gateway",
        "blog",
        "design-system",
        "mobile-app",
        "storefront"
    )

    "/Users/demo/Developer" -> listOf("experiments", "playground")

    else -> emptyList()
}

// sidebar folder ops

internal fun DemoServer.registerSidebarHandlers() {
    register("sidebarCreateFolder") { o ->
        val name = o.string("name")?.takeIf { it.isNotEmpty() } ?: return@register
        if (world.folders.none { it.name.equals(name, ignoreCase = true) }) {
            val id = slug(name)
            world.folders.add(
                DemoWorld.Folder(id = id, name = name, collapsed = false, members = emptyList())
            )
            world.sidebarOrder.add("group:$id")
        }
        sidebarMutationReply("sidebarCreateFolder")
    }
    register("sidebarRenameFolder") { o ->
        val name = o.string("name") ?: return@register
        val newName = o.string("newName") ?: return@register
        world.folders.firstOrNull { it.name.equals(name, ignoreCase = true) }?.name = newName
        sidebarMutationReply("sidebarRenameFolder")
    }
    register("sidebarDeleteFolder") { o ->
        val name = o.string("name") ?: return@register
        val fi = world.folders.indexOfFirst { it.name.equals(name, ignoreCase = true) }
        if (fi >= 0) {
            val folder = world.folders[fi]
            val ti = world.sidebarOrder.indexOf("group:${folder.id}")
            if (ti >= 0) {
                world.sidebarOrder.removeAt(ti)
                world.sidebarOrder.addAll(ti, folder.members)
            } else {
                world.sidebarOrder.addAll(folder.members)
            }
            world.folders.removeAt(fi)
        }
        sidebarMutationReply("sidebarDeleteFolder")
    }
    register("sidebarMoveProject") { o ->
        val project = o.string("project") ?: return@register
        moveProjectToFolder(project, o.string("folder"))
        sidebarMutationReply("sidebarMoveProject")
    }
}

// cross-domain hooks

/**
 * Add a project to the world: a fresh empty project (`copyOf` null) or a duplicate of
 * an existing one. Called by createProject/duplicate.
 */
internal fun DemoServer.demoAddProject(name: String, copyOf: String?) {
    if (world.projectIndex(name) != null) return
    val original = copyOf?.let { world.project(it) }
    if (copyOf != null && original != null) {
        val p = original.deepCopy()
        p.name = name
        p.label = name
        p.parentName = copyOf
        p.running = false
        p.activeProfile = ""
        for (s in p.services) s.running = false
        p.status = emptyList()
        p.seen = emptyList()
        p.workStatus = null
        p.autoPull = null
        p.claudeAccount = null
        p.claudeAccounts = null
        world.projects.add(p)
        demoCreateTerminals(project = name, copyOf = copyOf)
        demoCloneGitState(from = copyOf, to = name)
    } else {
        world.projects.add(
            DemoWorld.Project(
                name = name,
                label = name,
                running = false,
                services = listOf(
                    DemoWorld.Svc(name = "dev", cmd = "npm run dev", port = 3000, running = false)
                )
            )
        )
        world.sidebarOrder.add(name)
        demoCreateTerminals(project = name, copyOf = null)
    }
}

/**
 * Set a project's agent-status entries and push a `status-changed`. Called by the
 * terminal engine at Claude-script milestones.
 */
internal fun DemoServer.demoSetAgentStatus(project: String, entries: List<Dict>) {
    val idx = world.projectIndex(project) ?: return
    val nowMs = nowMillis()
    world.projects[idx].status = entries.map { e ->
        DemoWorld.Status(
            key = e.string("key") ?: "",
            value = e.string("value") ?: "",
            priority = e.int("priority") ?: 0,
            timestamp = e.long("timestamp") ?: nowMs,
            paneID = e.string("paneID") ?: ""
        )
    }
    // An agent's next report on a tab ends its seen agent there.
    val reporting = world.projects[idx].status.map { it.paneID }.toSet()
    world.projects[idx].seen = world.projects[idx].seen.filterNot { it.paneID in reporting }
    push(mapOf("t" to "status-changed", "project" to project))
}

// helpers

/**
 * The wire shape the Mac would write back: the normalized status, plus the clock a new
 * status starts and a re-applied one keeps.
 */
internal fun workStatusDict(status: WorkStatus, since: Long): Dict {
    val d = mutableMapOf<String, Any?>("state" to status.state, "since" to since)
    status.label?.let { d["label"] = it }
    status.emoji?.let { d["emoji"] = it }
    status.note?.let { d["note"] = it }
    return d
}

private fun DemoServer.sidebarMutationReply(t: String) {
    val o = world.sidebarPayload().toMutableMap()
    o["t"] = t
    o["ok"] = true
    push(o)
}

internal fun DemoServer.moveProjectToFolder(project: String, folder: String?) {
    for (f in world.folders) f.members = f.members.filter { it != project }
    world.sidebarOrder.removeAll { it == project }
    if (folder.isNullOrEmpty()) {
        world.sidebarOrder.add(project)
        return
    }
    val target = world.folders.firstOrNull { it.name.equals(folder, ignoreCase = true) }
        ?: DemoWorld.Folder(
            id = slug(folder),
            name = folder,
            collapsed = false,
            members = emptyList()
        )
            .also {
                world.folders.add(it)
                world.sidebarOrder.add("group:${it.id}")
            }
    target.members += project
}

internal fun DemoServer.ensureShellTerminal(project: String) {
    if (world.terminals[project]?.any { it.cli.isEmpty() } == true) return
    val n = (world.terminals[project]?.size ?: 0) + 1
    val id = "demo-$project-shell-${nowMillis()}"
    world.terminals.getOrPut(project) { mutableListOf() }.add(
        DemoWorld.Terminal(
            id = id,
            label = "Terminal $n",
            project = project,
            buffer = shellPrompt(project)
        )
    )
}

internal fun DemoServer.writeToShellAfter(seconds: Double, project: String, text: String) {
    after(seconds) { demoWriteToShell(project = project, text = text) }
}

internal fun DemoServer.writeToTerminalAfter(seconds: Double, id: String, text: String) {
    after(seconds) { demoWriteToTerminal(id = id, text = text) }
}

internal fun findAction(name: String, actions: List<Dict>): Dict? {
    for (a in actions) {
        if (a.string("name") == name) return a
        a.dicts("children")?.let { children -> findAction(name, children)?.let { return it } }
    }
    return null
}

internal fun substitute(cmd: String, values: Map<String, String>): String {
    var out = cmd
    for ((k, v) in values) out = out.replace("{{$k}}", v)
    return out
}

internal fun DemoServer.uniqueProjectName(
    base: String,
    reserved: Set<String> = emptySet()
): String {
    val root = slug(base)
    var name = root
    var n = 2
    while (world.projectIndex(name) != null || name in reserved) {
        name = "$root-$n"
        n += 1
    }
    return name
}

internal fun slug(s: String): String {
    val lowered = s.lowercase().trimmingWhitespacesAndNewlines()
    var out = lowered.graphemes().joinToString("") { if (it.isSwiftLetterOrNumber()) it else "-" }
    while ("--" in out) out = out.replace("--", "-")
    return out.trim('-')
}
