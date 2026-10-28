package cx.lpm.mobile.core.demo

/**
 * Demo handlers for the terminal engine: the terminal list, subscribe/seed, a scripted
 * fake shell and Claude Code session, lifecycle (new/close/rename/pin/reorder/restart), slash
 * commands, mentions, uploads, and the composer parity surface (actions, drafts,
 * transform, history). Owns the cross-domain hooks [demoCreateTerminals] and
 * [demoWriteToShell].
 */
internal fun DemoServer.registerTerminalsHandlers() {
    seedTerminalFixtures()

    register("terminals") { o ->
        val project = o.string("project") ?: return@register
        push(world.terminalsPayload(project))
    }

    register("sub") { o ->
        val id = o.string("id") ?: return@register
        val term = demoTerminal(id)?.copy() ?: return@register
        // The Mac drops a terminal whose process ended, so it answers as for one it no longer has.
        if (term.exited) {
            push(mapOf("t" to "exit", "id" to id, "code" to -1, "gone" to true))
            return@register
        }
        updateTerminal(id) { it.subscribed = true }
        val reply = mutableMapOf<String, Any?>(
            "t" to "seed",
            "id" to id,
            "cols" to term.cols,
            "rows" to term.rows,
            "data" to term.buffer,
            "owner" to demoOwner
        )
        world.composerDrafts[id]?.takeIf { it.text.isNotEmpty() }?.let { draft ->
            reply["draft"] = mapOf("text" to draft.text, "rev" to draft.rev)
        }
        push(reply)
        if (term.cli.isEmpty()) {
            armDevLog(id)
        } else if (!term.scriptStarted) {
            startClaudeScript(id)
        }
    }
    register("unsub") { o ->
        val id = o.string("id") ?: return@register
        updateTerminal(id) { it.subscribed = false }
    }
    register("claim") { o ->
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "control", "id" to id, "owner" to demoOwner))
    }
    register("in") { o ->
        val id = o.string("id") ?: return@register
        val d = o.string("d") ?: return@register
        if (d.startsWith("\u0000")) return@register
        val term = demoTerminal(id) ?: return@register
        if (term.cli.isEmpty()) handleShellInput(id, d) else handleClaudeInput(id, d)
    }
    register("resize") { o ->
        val id = o.string("id") ?: return@register
        updateTerminal(id) { t ->
            o.int("cols")?.takeIf { it > 0 }?.let { t.cols = it }
            o.int("rows")?.takeIf { it > 0 }?.let { t.rows = it }
        }
    }

    registerTerminalLifecycleHandlers()
    registerComposerHandlers()
}

private fun DemoServer.registerTerminalLifecycleHandlers() {
    register("newTerminal") { o ->
        val project = o.string("project") ?: return@register
        val (n, id) = nextTerminalId(project)
        val term = DemoWorld.Terminal(
            id = id,
            label = "Terminal $n",
            project = project,
            buffer = shellPrompt(project)
        )
        world.terminals.getOrPut(project) { mutableListOf() }.add(term)
        push(mapOf("t" to "newTerminal", "ok" to true))
    }
    // A shell that ran `exit` comes back in its tab under a new id, as the desktop's
    // Restart does; one still running is left alone.
    register("restartTerminal") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "restartTerminal", "ok" to true))
        val list = world.terminals[project] ?: return@register
        val index = list.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: return@register
        val old = list[index]
        if (!old.exited) return@register
        list[index] = DemoWorld.Terminal(
            id = nextTerminalId(project).second,
            label = old.label,
            project = project,
            remote = old.remote,
            pinned = old.pinned,
            emoji = old.emoji,
            buffer = shellPrompt(project)
        )
        world.composerDrafts.remove(id)
        push(world.terminalsPayload(project))
    }
    register("closeTerminal") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        val wasAgent = demoTerminal(id)?.cli == "claude"
        world.terminals[project]?.removeAll { it.id == id }
        world.composerDrafts.remove(id)
        demoDropSeenAgents(project = project, pane = id)
        if (wasAgent) demoSetAgentStatus(project = project, entries = emptyList())
        push(mapOf("t" to "closeTerminal", "ok" to true))
    }
    register("renameTerminal") { o ->
        val id = o.string("id") ?: return@register
        val label = o.string("label") ?: return@register
        updateTerminal(id) { it.label = label }
        push(mapOf("t" to "renameTerminal", "ok" to true))
    }
    register("pinTerminal") { o ->
        val id = o.string("id") ?: return@register
        updateTerminal(id) { it.pinned = !it.pinned }
        push(mapOf("t" to "pinTerminal", "ok" to true))
    }
    register("reorderTerminals") { o ->
        val project = o.string("project") ?: return@register
        val order = o.strings("order") ?: return@register
        world.terminals[project]?.sortBy { t ->
            order.indexOf(t.id).takeIf { it >= 0 } ?: Int.MAX_VALUE
        }
    }
}

private fun DemoServer.registerComposerHandlers() {
    register("slash") { o ->
        val id = o.string("id") ?: return@register
        val isAgent = demoTerminal(id)?.cli == "claude"
        push(
            mapOf(
                "t" to "slash",
                "id" to id,
                "commands" to if (isAgent) claudeSlashCommands else emptyList()
            )
        )
    }
    register("mentions") { o ->
        val project = o.string("project") ?: return@register
        push(mapOf("t" to "mentions", "project" to project, "entries" to mentionEntries(project)))
    }
    register("upload") { o ->
        val id = o.string("id") ?: return@register
        val mime = o.string("mime") ?: "image/png"
        val name = o.string("name")?.takeIf { it.isNotEmpty() }
            ?: "image-${nowMillis()}.${fileExt(mime)}"
        val reply = mutableMapOf<String, Any?>(
            "t" to "upload",
            "id" to id,
            "ok" to true,
            "path" to "/Users/demo/uploads/$name"
        )
        o["reqId"]?.let { reply["reqId"] = it }
        pushAfter(0.35, reply)
    }
    register("composerActions") {
        push(mapOf("t" to "composerActions", "actions" to composerActions))
    }
    register("composerDraft") { o ->
        val id = o.string("id") ?: return@register
        val text = o.string("text") ?: ""
        world.composerDraftRev += 1
        val rev = world.composerDraftRev
        if (text.isEmpty()) {
            world.composerDrafts.remove(id)
        } else {
            world.composerDrafts[id] = DemoWorld.ComposerDraft(text = text, rev = rev)
        }
        push(
            mapOf(
                "t" to "composerDraft",
                "id" to id,
                "text" to text,
                "rev" to rev,
                "origin" to DemoServer.DEVICE_ID
            )
        )
    }
    register("transform") { o ->
        val reqId = o["reqId"] ?: ""
        val count = maxOf(1, minOf(5, o.int("variants") ?: 1))
        val rewrites = demoRewrites(
            o.string("text") ?: "",
            instruction = o.string("instruction") ?: "",
            count = count
        )
        for (i in 0 until count) {
            pushAfter(
                0.9 + 0.8 * i,
                mapOf(
                    "t" to "transform",
                    "reqId" to reqId,
                    "idx" to i,
                    "ok" to true,
                    "text" to rewrites[i]
                )
            )
        }
        pushAfter(
            0.9 + 0.8 * (count - 1) + 0.4,
            mapOf("t" to "transformDone", "reqId" to reqId, "ok" to true)
        )
    }

    register("history") { o ->
        val project = o.string("project") ?: return@register
        val q = o.string("q") ?: ""
        val rows = world.historyMessages
            .filter {
                it.project == project &&
                    (q.isEmpty() || it.text.contains(q, ignoreCase = true))
            }
            .sortedByDescending { it.at }
            .take(30)
            .map {
                mapOf(
                    "id" to it.id,
                    "text" to it.text,
                    "terminalLabel" to "Claude",
                    "isDraft" to (it.kind == "draft")
                )
            }
        push(mapOf("t" to "history", "project" to project, "rows" to rows))
    }
    register("historyAdd") { o ->
        val project = o.string("project") ?: return@register
        val text = o.string("text")?.takeIf { it.isNotEmpty() } ?: return@register
        val nowMs = nowMillis()
        val seq = (world.historyMessages.maxOfOrNull { it.seq } ?: 0) + 1
        world.historyMessages.add(
            DemoWorld.HistoryMessage(
                id = "h$nowMs-$seq",
                text = text,
                timestamp = nowMs,
                project = project,
                at = nowMs,
                seq = seq
            )
        )
    }
}

private val composerActions = listOf(
    mapOf(
        "id" to "improve",
        "icon" to "sparkles",
        "label" to "Improve writing",
        "instruction" to "Improve the writing of this text while keeping its meaning."
    ),
    mapOf(
        "id" to "shorter",
        "icon" to "minimize",
        "label" to "Make shorter",
        "instruction" to "Make this text shorter and more concise."
    ),
    mapOf(
        "id" to "grammar",
        "icon" to "spellcheck",
        "label" to "Fix grammar",
        "instruction" to "Fix the grammar and spelling of this text."
    ),
    mapOf(
        "id" to "detailed",
        "icon" to "zap",
        "label" to "More detailed",
        "instruction" to "Make this text more detailed and specific."
    )
)

// cross-domain hooks

/**
 * Create the terminals for a freshly added project: mirrored from `copyOf` (fresh ids,
 * fresh screens) or empty for a brand-new project. Called by demoAddProject.
 */
internal fun DemoServer.demoCreateTerminals(project: String, copyOf: String?) {
    val src = copyOf?.let { world.terminals[it] }
    if (src == null) {
        if (world.terminals[project] == null) world.terminals[project] = mutableListOf()
        return
    }
    world.terminals[project] = src.mapIndexedTo(mutableListOf()) { i, t ->
        t.copy(
            id = "demo-$project-${i + 1}",
            project = project,
            buffer = if (t.cli.isEmpty()) shellPrompt(project) else claudeWelcome(project),
            scriptStarted = false,
            scriptFinished = false,
            subscribed = false,
            pendingInput = "",
            queuedInput = "",
            queuedSubmit = false,
            logTickArmed = false,
            responding = false,
            ackCount = 0
        )
    }
}

/**
 * Write canned output into the project's shell terminal and stream it to any
 * subscriber, redrawing the prompt and any pending input under it.
 */
internal fun DemoServer.demoWriteToShell(project: String, text: String) {
    val shell = world.terminals[project]?.firstOrNull { it.cli.isEmpty() } ?: return
    demoWriteToTerminal(id = shell.id, text = text)
}

/**
 * Same as [demoWriteToShell], targeting a specific terminal. Used by runAction to
 * stream an action's output into its freshly spawned terminal.
 */
internal fun DemoServer.demoWriteToTerminal(id: String, text: String) {
    val term = demoTerminal(id) ?: return
    var body = text.replace("\r\n", "\n").replace("\n", "\r\n")
    if (!body.endsWith("\r\n")) body += "\r\n"
    val chunk = "\r\u001B[2K" + body + shellPrompt(term.project) + term.pendingInput
    appendBuffer(id, chunk)
    push(mapOf("t" to "o", "id" to id, "d" to chunk))
}
