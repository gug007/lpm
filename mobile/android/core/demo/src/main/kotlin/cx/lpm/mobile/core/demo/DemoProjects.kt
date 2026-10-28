package cx.lpm.mobile.core.demo

import java.util.Base64

/**
 * Demo handlers for the project list, sidebar, status, lifecycle (start/stop/services),
 * duplicate, add/remove, actions, and file reads. Also owns the cross-domain hooks
 * [demoAddProject] and [demoSetAgentStatus], called by other domains.
 */
internal fun DemoServer.registerProjectsHandlers() {
    register("projects") { push(world.projectsPayload()) }
    register("sidebar") { push(world.sidebarPayload()) }
    register("status") { o ->
        val project = o.string("project") ?: return@register
        push(world.statusPayload(project))
    }
    register("duplicateDefaults") {
        push(
            mapOf(
                "t" to "duplicateDefaults",
                "excludeUncommitted" to world.duplicateExcludeUncommitted,
                "reinstallDeps" to world.duplicateReinstallDeps,
                "pullLatest" to world.duplicatePullLatest
            )
        )
    }

    registerAgentArchiveHandlers()
    registerLifecycleHandlers()
    registerServiceHandlers()
    registerServiceLogHandlers()
    registerProjectMutationHandlers()
    registerCreationHandlers()
    registerSidebarHandlers()
    registerActionHandlers()
}

// lifecycle

private fun DemoServer.registerLifecycleHandlers() {
    register("start") { o ->
        val name = o.string("name") ?: return@register
        if (world.projectIndex(name) == null) return@register
        val profile = o.string("profile") ?: ""
        pushAfter(0.8) {
            val idx = world.projectIndex(name) ?: return@pushAfter null
            val p = world.projects[idx]
            p.running = true
            p.activeProfile = if (p.profiles.any { it.name == profile }) profile else ""
            startTargets(idx, profile).firstOrNull()?.let { p.services[it].running = true }
            mapOf("t" to "projects-changed")
        }
        pushAfter(1.6) {
            val idx = world.projectIndex(name) ?: return@pushAfter null
            if (!world.projects[idx].running) return@pushAfter null
            for (si in startTargets(idx, profile)) world.projects[idx].services[si].running = true
            push(mapOf("t" to "status-changed", "project" to name))
            mapOf("t" to "projects-changed")
        }
    }
    register("stop") { o ->
        val name = o.string("name") ?: return@register
        if (world.projectIndex(name) == null) return@register
        pushAfter(0.9) {
            val idx = world.projectIndex(name) ?: return@pushAfter null
            val p = world.projects[idx]
            p.running = false
            p.activeProfile = ""
            for (s in p.services) s.running = false
            push(mapOf("t" to "status-changed", "project" to name))
            mapOf("t" to "projects-changed")
        }
    }
    register("toggleService") { o ->
        val name = o.string("name") ?: return@register
        val service = o.string("service") ?: return@register
        pushAfter(0.9) {
            val idx = world.projectIndex(name) ?: return@pushAfter null
            val p = world.projects[idx]
            val s = p.services.firstOrNull { it.name == service } ?: return@pushAfter null
            s.running = !s.running
            p.running = p.services.any { it.running }
            mapOf("t" to "projects-changed")
        }
    }
}

private fun DemoServer.startTargets(idx: Int, profile: String): List<Int> {
    val p = world.projects[idx]
    val prof = p.profiles.firstOrNull { it.name == profile }
    if (profile.isNotEmpty() && prof != null) {
        return p.services.indices.filter { p.services[it].name in prof.services }
    }
    return p.services.indices.toList()
}

// services, logs & files

private fun DemoServer.registerServiceHandlers() {
    register("services") { o ->
        val project = o.string("project") ?: return@register
        val p = world.project(project)
        if (p == null) {
            push(
                mapOf(
                    "t" to "services",
                    "project" to project,
                    "ok" to false,
                    "error" to "That project isn't available."
                )
            )
            return@register
        }
        var pane = 0
        val services = p.services.map { s ->
            val live = p.running && s.running
            val d = mutableMapOf<String, Any?>(
                "name" to s.name,
                "running" to live,
                "cmd" to s.cmd,
                "port" to s.port
            )
            if (live) d["paneIndex"] = pane++
            d
        }
        push(
            mapOf(
                "t" to "services",
                "project" to project,
                "ok" to true,
                "running" to p.running,
                "services" to services
            )
        )
    }
    register("fileChunk") { o ->
        val project = o.string("project") ?: return@register
        val path = o.string("path") ?: return@register
        val bytes = demoFileContent(project, path).toByteArray()
        val offset = (o["offset"].numberValue() ?: 0).coerceIn(0, bytes.size.toLong()).toInt()
        val length = o["length"].numberValue() ?: bytes.size.toLong()
        val end = (offset + length).coerceIn(offset.toLong(), bytes.size.toLong()).toInt()
        push(
            mapOf(
                "t" to "fileChunk",
                "reqId" to (o["reqId"] ?: ""),
                "ok" to true,
                "path" to path,
                "size" to bytes.size,
                "mtime" to 1,
                "offset" to offset,
                "data" to Base64.getEncoder().encodeToString(bytes.copyOfRange(offset, end))
            )
        )
    }
}

// rename / remove / duplicate

private fun DemoServer.registerProjectMutationHandlers() {
    register("renameProject") { o ->
        val project = o.string("project") ?: return@register
        world.projectIndex(project)?.let { idx ->
            val label = o.string("name") ?: ""
            world.projects[idx].label = label.ifEmpty { project }
        }
        push(mapOf("t" to "renameProject", "project" to project, "ok" to true))
        pushAfter(0.1) { mapOf("t" to "projects-changed") }
    }
    register("setWorkStatus") { o ->
        val project = o.string("project") ?: return@register
        val idx = world.projectIndex(project)
        val patch = o.dict("status")
        if (patch != null) {
            val next = WorkStatus.from(patch)
            if (next == null) {
                push(
                    mapOf(
                        "t" to "setWorkStatus",
                        "project" to project,
                        "ok" to false,
                        "error" to "Couldn't set the status."
                    )
                )
                return@register
            }
            if (idx != null) {
                val current = world.projects[idx].workStatus?.let(WorkStatus::from)
                val kept = if (current?.key == next.key) current.since else 0L
                world.projects[idx].workStatus =
                    workStatusDict(next, since = if (kept == 0L) nowMillis() else kept)
            }
        } else if (idx != null) {
            world.projects[idx].workStatus = null
        }
        push(mapOf("t" to "setWorkStatus", "project" to project, "ok" to true))
        pushAfter(0.1) { mapOf("t" to "projects-changed") }
    }
    register("remove") { o ->
        val name = o.string("name") ?: return@register
        if (world.projects.any { it.parentName == name }) {
            push(
                mapOf(
                    "t" to "remove",
                    "ok" to false,
                    "error" to "Remove this project's duplicates first."
                )
            )
            return@register
        }
        world.projects.removeAll { it.name == name }
        world.terminals.remove(name)
        world.backgroundRuns.removeAll { it.project == name }
        world.sidebarOrder.removeAll { it == name }
        for (folder in world.folders) folder.members = folder.members.filter { it != name }
        push(mapOf("t" to "remove", "ok" to true))
        pushAfter(0.1) { mapOf("t" to "projects-changed") }
    }
    register("duplicate") { o -> duplicate(o) }
}

private fun DemoServer.duplicate(o: Dict) {
    val name = o.string("name") ?: return
    val source = world.project(name)
    if (source == null) {
        push(mapOf("t" to "duplicate", "ok" to false, "error" to "That project isn't available."))
        return
    }
    val count = minOf(50, maxOf(1, o.int("count") ?: 1))
    val labels = o.strings("labels") ?: emptyList()
    val groupName = o.string("groupName")?.takeIf { it.isNotEmpty() }
    val excludeUncommitted = o.bool("excludeUncommitted") ?: false
    val pullLatest = o.bool("pullLatest") ?: true
    world.duplicateExcludeUncommitted = excludeUncommitted
    world.duplicateReinstallDeps = o.bool("reinstallDeps") ?: false
    world.duplicatePullLatest = pullLatest

    var runCmd = ""
    when (o.string("runMode") ?: "none") {
        "action" -> {
            val action = o.string("action")?.let { findAction(it, source.actions) }
            if (action != null) runCmd = action.string("cmd") ?: ""
        }

        "command" -> runCmd = (o.string("command") ?: "").trimmingWhitespacesAndNewlines()
    }

    // Names are planned up front (so blank labels uniquify against each other), but
    // each copy lands at its progress tick so the list streams.
    val reserved = mutableSetOf<String>()
    val plans = (0 until count).map { i ->
        val label = labels.getOrElse(i) { "" }.trimmingWhitespacesAndNewlines()
        val copyName = uniqueProjectName(label.ifEmpty { name }, reserved)
        reserved.add(copyName)
        copyName to label
    }
    plans.forEachIndexed { i, (planName, planLabel) ->
        after(0.7 * (i + 1)) {
            createDuplicate(
                source = name,
                copyName = planName,
                label = planLabel,
                excludeUncommitted = excludeUncommitted,
                pullLatest = pullLatest,
                groupName = groupName,
                runCmd = runCmd
            )
            push(
                mapOf(
                    "t" to "duplicateProgress",
                    "done" to i + 1,
                    "total" to count,
                    "name" to planName
                )
            )
            push(mapOf("t" to "projects-changed"))
        }
    }
    pushAfter(0.7 * count + 0.5) {
        mapOf(
            "t" to "duplicate",
            "ok" to true,
            "name" to (plans.firstOrNull()?.first ?: name),
            "names" to plans.map { it.first }
        )
    }
}

internal fun DemoServer.createDuplicate(
    source: String,
    copyName: String,
    label: String,
    excludeUncommitted: Boolean,
    pullLatest: Boolean,
    groupName: String?,
    runCmd: String
) {
    if (world.project(source) == null) return
    demoAddProject(name = copyName, copyOf = source)
    if (label.isNotEmpty()) world.projectIndex(copyName)?.let { world.projects[it].label = label }
    if (excludeUncommitted) world.git[copyName]?.files = emptyList()
    if (pullLatest) world.git[copyName]?.behind = 0
    if (groupName != null) moveProjectToFolder(copyName, groupName)
    if (runCmd.isEmpty()) return
    ensureShellTerminal(copyName)
    demoWriteToShell(project = copyName, text = runCmd + "\r\n")
    writeToShellAfter(1.2, project = copyName, text = commandOutput(runCmd, copyName))
}
