package cx.lpm.mobile.core.demo

/**
 * Demo handlers for seen and archived agents (`agentArchive`), with the Mac's Keep
 * finished agents until archived on: opening a finished agent marks it seen, and it
 * stays listed until it's archived.
 */
internal fun DemoServer.registerAgentArchiveHandlers() {
    register("clearStatus") { o ->
        val project = o.string("project") ?: return@register
        val pane = o.string("paneId") ?: return@register
        val value = o.string("value") ?: return@register
        markSeen(project) { it.paneID == pane && it.value == value }
    }
    register("markStatusSeen") { o ->
        val project = o.string("project") ?: return@register
        val keys = o.strings("keys") ?: return@register
        markSeen(project) { it.key in keys && it.finished }
    }
    register("markStatusUnread") { o ->
        val project = o.string("project") ?: return@register
        val keys = o.strings("keys") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] } ?: return@register
        val unread = p.seen.filter { it.key in keys }
        if (unread.isEmpty()) return@register
        p.seen = p.seen.filterNot { it.key in keys }
        p.status = p.status + unread.map { it.copy(seenAt = 0) }
        push(mapOf("t" to "status-changed", "project" to project))
    }
    register("archiveStatus") { o ->
        val project = o.string("project") ?: return@register
        val keys = o.strings("keys") ?: return@register
        val p = world.projectIndex(project)?.let { world.projects[it] } ?: return@register
        val before = p.status.size + p.seen.size
        p.status = p.status.filterNot { it.key in keys && it.finished }
        p.seen = p.seen.filterNot { it.key in keys }
        if (p.status.size + p.seen.size == before) return@register
        push(mapOf("t" to "status-changed", "project" to project))
    }
}

/** Closing a tab drops the seen agent it held. */
internal fun DemoServer.demoDropSeenAgents(project: String, pane: String) {
    val p = world.projectIndex(project)?.let { world.projects[it] } ?: return
    if (p.seen.none { it.paneID == pane }) return
    p.seen = p.seen.filterNot { it.paneID == pane }
    push(mapOf("t" to "status-changed", "project" to project))
}

private fun DemoServer.markSeen(project: String, matches: (DemoWorld.Status) -> Boolean) {
    val p = world.projectIndex(project)?.let { world.projects[it] } ?: return
    val now = nowMillis()
    val moving = p.status.filter(matches)
    if (moving.isEmpty()) return
    p.status = p.status.filterNot(matches)
    p.seen = p.seen + moving.map { it.copy(seenAt = now) }
    push(mapOf("t" to "status-changed", "project" to project))
}

private val DemoWorld.Status.finished: Boolean get() = value == "Done" || value == "Error"

/**
 * Agents opened earlier and kept, muted, under their projects: two finished turns in
 * mobile-app and a problem in design-system, each in a tab of its own.
 */
internal fun DemoWorld.seedSeenAgents(nowMs: Long) {
    val minute = 60_000L
    fun tab(project: String, cli: String, label: String, prompt: String, reply: String) =
        DemoWorld.Terminal(
            id = "demo-$project-$cli",
            label = label,
            project = project,
            cli = cli,
            buffer = "\u001B[1m>\u001B[0m $prompt\r\n\r\n" +
                "\u001B[38;5;153m⏺\u001B[0m $reply\r\n\r\n\u001B[1m>\u001B[0m ",
            scriptStarted = true,
            scriptFinished = true
        )
    fun seen(
        key: String,
        value: String,
        pane: String,
        endedAgo: Long,
        took: Long,
        seenAgo: Long
    ): DemoWorld.Status {
        val ended = nowMs - endedAgo
        return DemoWorld.Status(
            key = key,
            value = value,
            priority = if (value == "Error") 40 else 20,
            timestamp = ended,
            paneID = pane,
            turnStart = ended - took,
            endedAt = ended,
            seenAt = nowMs - seenAgo
        )
    }
    terminals["mobile-app"] = mutableListOf(
        tab(
            "mobile-app",
            "claude",
            "Dark mode for settings",
            prompt = "Add dark mode to the settings screen",
            reply = "Settings now follows the system appearance, with its own override."
        ),
        tab(
            "mobile-app",
            "codex",
            "Remove unused deps",
            prompt = "Remove dependencies nothing imports",
            reply = "Removed 4 unused packages from package.json."
        )
    )
    terminals["design-system"] = mutableListOf(
        tab(
            "design-system",
            "claude",
            "Fix flaky snapshot test",
            prompt = "Fix the flaky Button snapshot test",
            reply = "The snapshot still differs on CI: fonts render differently there."
        )
    )
    project("mobile-app")?.seen = listOf(
        seen(
            "claude_code_demo-mobile-app-claude",
            "Done",
            pane = "demo-mobile-app-claude",
            endedAgo = 9 * minute,
            took = 12 * minute + 11_000,
            seenAgo = 4 * minute
        ),
        seen(
            "codex_demo-mobile-app-codex",
            "Done",
            pane = "demo-mobile-app-codex",
            endedAgo = 41 * minute,
            took = 95_000,
            seenAgo = 33 * minute
        )
    )
    project("design-system")?.seen = listOf(
        seen(
            "claude_code_demo-design-system-claude",
            "Error",
            pane = "demo-design-system-claude",
            endedAgo = 65 * minute,
            took = 6 * minute + 5_000,
            seenAgo = 58 * minute
        )
    )
}
