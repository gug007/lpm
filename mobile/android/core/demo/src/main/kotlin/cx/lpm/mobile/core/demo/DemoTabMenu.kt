package cx.lpm.mobile.core.demo

/**
 * Demo handlers for the tab menu's fork / fork into copy / conversation title / close
 * others, answered as the Mac answers them: an ack, then the tabs again.
 */
internal fun DemoServer.registerTabMenuHandlers() {
    register("forkTerminal") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "forkTerminal", "ok" to true))
        val source = forkableTerminal(project, id) ?: return@register
        world.terminals.getOrPut(project) { mutableListOf() }.add(fork(source, project))
        push(world.terminalsPayload(project))
    }
    // A copy of the project, made the way Duplicate makes one, with the conversation
    // carried on in a tab there.
    register("forkTerminalCopy") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "forkTerminalCopy", "ok" to true))
        val source = forkableTerminal(project, id) ?: return@register
        val copyName = uniqueProjectName(project)
        after(FORK_COPY_SECONDS) {
            createDuplicate(
                source = project,
                copyName = copyName,
                label = "",
                excludeUncommitted = false,
                pullLatest = false,
                groupName = null,
                runCmd = ""
            )
            world.terminals.getOrPut(copyName) { mutableListOf() }.add(fork(source, copyName))
            push(mapOf("t" to "projects-changed"))
        }
    }
    register("titleTerminal") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "titleTerminal", "ok" to true))
        val tab = world.terminals[project]?.firstOrNull { it.id == id && it.cli == "claude" }
            ?: return@register
        tab.label = DemoWorld.CONVERSATION_TITLE
        push(world.terminalsPayload(project))
    }
    // The conversation carries on in the same tab under a new id, covered while it
    // moves, as the Mac moves it.
    register("switchTerminalAccount") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        val account = o.string("account") ?: return@register
        push(mapOf("t" to "switchTerminalAccount", "ok" to true))
        val list = world.terminals[project] ?: return@register
        val index = list.indexOfFirst { it.id == id }
        val old = list.getOrNull(index)?.takeIf { it.cli == "claude" } ?: return@register
        val name = world.claude.accounts.firstOrNull { it.id == account && it.signedIn }
            ?.let { if (it.id == CLAUDE_MAIN_LOGIN) "Main login" else it.label }
            ?: return@register
        val moved = old.copy(
            tabKey = old.tabKey ?: old.id,
            id = nextTerminalId(project).second,
            subscribed = false,
            claudeAccount = account,
            switchingTo = name,
            switchedFrom = id,
            limitStop = null
        )
        list[index] = moved
        push(world.terminalsPayload(project))
        val reporting = world.projectIndex(project)?.let { world.projects[it] }
        if (reporting != null && reporting.status.any { it.paneID == id }) {
            reporting.status =
                reporting.status.map { if (it.paneID == id) it.copy(paneID = moved.id) else it }
            push(mapOf("t" to "status-changed", "project" to project))
        }
        after(ACCOUNT_MOVE_SECONDS) {
            val tab = world.terminals[project]?.firstOrNull { it.id == moved.id } ?: return@after
            tab.switchingTo = null
            tab.switchedFrom = null
            push(world.terminalsPayload(project))
        }
    }
    // The limit bar put away, as its × does on the Mac.
    register("dismissLimitStop") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "dismissLimitStop", "ok" to true))
        val tab = world.terminals[project]?.firstOrNull { it.id == id && it.limitStop != null }
            ?: return@register
        tab.limitStop = null
        push(world.terminalsPayload(project))
    }
    register("closeOtherTerminals") { o ->
        val project = o.string("project") ?: return@register
        val id = o.string("id") ?: return@register
        push(mapOf("t" to "closeOtherTerminals", "ok" to true))
        val list = world.terminals[project] ?: return@register
        val kept = list.firstOrNull { it.id == id } ?: return@register
        val closing = list.filter { it.id != id && !it.pinned }
        if (closing.isEmpty()) return@register
        val closed = closing.map { it.id }.toSet()
        list.removeAll { it.id in closed }
        closed.forEach { world.composerDrafts.remove(it) }
        if (kept.cli != "claude" && closing.any { it.cli == "claude" }) {
            demoSetAgentStatus(project = project, entries = emptyList())
        }
        push(world.terminalsPayload(project))
    }
}

private fun DemoServer.forkableTerminal(project: String, id: String): DemoWorld.Terminal? =
    world.terminals[project]?.firstOrNull { it.id == id && it.cli == "claude" }

/**
 * A new tab carrying on [source]'s conversation: what it has said so far, and no
 * scripted session of its own to play again.
 */
private fun DemoServer.fork(source: DemoWorld.Terminal, project: String) = DemoWorld.Terminal(
    id = nextTerminalId(project).second,
    label = source.label,
    project = project,
    emoji = source.emoji,
    cli = source.cli,
    buffer = source.buffer,
    scriptStarted = true,
    scriptFinished = true
)

private const val FORK_COPY_SECONDS = 0.7
private const val ACCOUNT_MOVE_SECONDS = 1.2
