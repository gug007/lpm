package cx.lpm.mobile.core.data.terminals

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.claim
import cx.lpm.mobile.core.data.client.newTerminal
import cx.lpm.mobile.core.data.client.pinTerminal
import cx.lpm.mobile.core.data.client.recordHistory
import cx.lpm.mobile.core.data.client.renameTerminal
import cx.lpm.mobile.core.data.client.reorderTerminals
import cx.lpm.mobile.core.data.client.requestHistory
import cx.lpm.mobile.core.data.client.requestMentions
import cx.lpm.mobile.core.data.client.requestSlash
import cx.lpm.mobile.core.data.client.requestTerminals
import cx.lpm.mobile.core.data.client.resize
import cx.lpm.mobile.core.data.client.restartTerminal
import cx.lpm.mobile.core.data.client.sendInput
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.LimitStop
import cx.lpm.mobile.core.model.TerminalInfo
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Each project's terminals and each terminal's stream. The desktop creates and
 * closes terminals asynchronously, so a create shows a placeholder until a new id
 * appears and a close hides the row until the list confirms it — each with a
 * timeout that reloads the list so the screen converges on the Mac's truth.
 */
class TerminalsStore(internal val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(TerminalsState())
    val state: StateFlow<TerminalsState> = mutable.asStateFlow()

    // Streams go straight to the newest screen showing the terminal; its emulator
    // holds the buffer, not this store.
    val screens = TerminalScreens()

    private val closed = MutableSharedFlow<String>(extraBufferCapacity = CLOSED_BUFFER)

    /** Terminals closed from this phone, so per-terminal state elsewhere can go too. */
    val closedTerminals: SharedFlow<String> = closed.asSharedFlow()

    // Ids present when a create was requested; a list with an id outside it means
    // the new terminal landed.
    private val creatingBaseline = mutableMapOf<String, Set<String>>()
    private val creatingTimeout = GenerationTimeout<String>(session.scope)

    // A "switch to the terminal this run spawns" watcher per project; any newer
    // create intent replaces it, so a stale run can't trigger a switch.
    private val spawnCallbacks = mutableMapOf<String, (TerminalInfo) -> Unit>()

    // project → ids with a close in flight, filtered from incoming lists until the
    // desktop confirms, so a stale list can't flash the row back.
    private val closingTerminals = mutableMapOf<String, Set<String>>()
    private val closingTimeout = GenerationTimeout<String>(session.scope)

    // terminal id → a prompt to submit once its screen shows content ("Ask agent…"
    // opens a terminal that may not be on screen yet).
    private val queuedPrompts = mutableMapOf<String, String>()

    internal val client: LpmClient? get() = session.client

    override fun wire(client: LpmClient) {
        val c = client
        c.onTerminals = ::applyTerminals
        c.onSlash = { id, commands ->
            mutable.update { it.copy(slashCommands = it.slashCommands + (id to commands)) }
        }
        c.onMentions = { project, entries, computers ->
            mutable.update {
                it.copy(
                    mentions = it.mentions + (project to entries),
                    mentionComputers = it.mentionComputers + (project to computers)
                )
            }
        }
        c.onHistory = { project, rows ->
            mutable.update {
                it.copy(
                    history =
                        it.history + (project to rows.filterNot { row -> row.isDraft })
                )
            }
        }
        c.onSeed = { id, cols, rows, data, reset ->
            screens.current(id)?.seed?.invoke(cols, rows, data, reset)
        }
        c.onOutput = { id, data -> screens.current(id)?.output?.invoke(data) }
        c.onControl = { id, owner ->
            mutable.update {
                val owners = it.controlOwner - id
                it.copy(controlOwner = if (owner != null) owners + (id to owner) else owners)
            }
        }
        c.onExit = { id, code, gone ->
            mutable.update { it.recordingEnding(id, code, gone, session.env.clock.millis()) }
        }
        // A runAction/newTerminal the Mac couldn't execute: stop the placeholder.
        c.onActionFailed = { project, message ->
            creatingBaseline.remove(project)
            spawnCallbacks.remove(project)
            mutable.update { it.copy(creatingTerminals = it.creatingTerminals - project) }
            session.alerts.showError(message)
        }
    }

    /** The link dropped: terminals that ended just before it went down with lpm. */
    override fun onConnectionReset() {
        mutable.update { it.lostWithLink(session.env.clock.millis()) }
    }

    override fun reset() {
        pendingTabCloseJob?.cancel()
        pendingTabCloseJob = null
        mutable.value = TerminalsState()
        creatingBaseline.clear()
        creatingTimeout.cancelAll()
        spawnCallbacks.clear()
        closingTerminals.clear()
        closingTimeout.cancelAll()
        queuedPrompts.clear()
    }

    private fun applyTerminals(project: String, terminals: List<TerminalInfo>) {
        var list = terminals
        closingTerminals[project]?.let { closing ->
            // Ids gone from the list are confirmed closed; the rest stay hidden.
            val still = closing.intersect(terminals.map { it.id }.toSet())
            closingTerminals[project] = still
            if (still.isEmpty()) closingTerminals.remove(project)
            list = list.filterNot { it.id in still }
        }
        mutable.update { it.copy(terminals = it.terminals + (project to list)) }
        val base = creatingBaseline[project] ?: return
        val fresh = list.firstOrNull { it.id !in base } ?: return
        creatingBaseline.remove(project)
        mutable.update { it.copy(creatingTerminals = it.creatingTerminals - project) }
        spawnCallbacks[project]?.let { callback ->
            callback(fresh)
            spawnCallbacks.remove(project)
        }
    }

    // MARK: terminal screens

    /**
     * A screen showing `id` appeared. Every screen subscribes, so a second copy of an
     * open terminal gets its own fresh seed; an old ending is asked about again —
     * a terminal lpm lost while restarting can be back.
     */
    fun openTerminalScreen(id: String, key: Any, hooks: TerminalHooks) {
        screens.open(id, key, hooks)
        if (id in state.value.endedTerminals) {
            mutable.update { it.copy(endedTerminals = it.endedTerminals - id) }
        }
        client?.subscribe(id)
    }

    fun closeTerminalScreen(id: String, key: Any) {
        when (screens.close(id, key)) {
            TerminalScreens.Closed.Covered -> Unit

            // The copy underneath stopped receiving while the newer one was up.
            TerminalScreens.Closed.Revealed -> client?.subscribe(id)

            TerminalScreens.Closed.Last -> client?.unsubscribe(id)
        }
    }

    /** A fresh seed for a terminal whose web view restarted empty. */
    fun reseed(id: String) {
        client?.subscribe(id)
    }

    /** Catch a terminal still on screen up on what it missed while the app was away. */
    fun resync(id: String) {
        client?.resync(id)
    }

    fun input(id: String, data: String) {
        client?.sendInput(id, data)
    }

    /** Only the owner drives the shared PTY size; a non-owner doesn't even send. */
    fun resize(id: String, cols: Int, rows: Int) {
        if (isControlled(id)) client?.resize(id, cols, rows)
    }

    /**
     * Whether this phone renders the terminal live: it owns it, or ownership is
     * unknown/unclaimed (so a terminal only this phone shows never turns into a
     * placeholder).
     */
    fun isControlled(id: String): Boolean {
        val owner = state.value.controlOwner[id] ?: return true
        return owner.kind == "mobile" && owner.id == client?.deviceId
    }

    /** The owner's friendly name, for the placeholder ("Active on <name>"). */
    fun controlOwnerLabel(id: String): String {
        val owner = state.value.controlOwner[id] ?: return "another device"
        if (owner.kind == "window") session.state.value.activeRecord?.let { return it.displayName }
        return owner.label
    }

    /** "Take control": this phone becomes the owner; the previous one gets the placeholder. */
    fun claimControl(id: String) {
        client?.claim(id)
    }

    /**
     * Send a composed message through the web view (which wraps it as a bracketed
     * paste when the program enabled that, then submits). False — so the composer
     * keeps the text — when it can't go out now: no live link (keystrokes are never
     * replayed), a link still being checked, or no screen showing the terminal.
     */
    fun submit(id: String, text: String): Boolean {
        val screen = screens.current(id)
        if (!session.state.value.isReady || client?.isVerifying == true ||
            screen == null
        ) {
            return false
        }
        if (id in state.value.endedTerminals) return false
        screen.submit(text)
        return true
    }

    /** Submit [prompt] into the terminal once a screen shows it. */
    fun queuePrompt(id: String, prompt: String) {
        queuedPrompts[id] = prompt
    }

    /**
     * A screen showing the terminal rendered its first content: a queued prompt goes
     * in, after a moment for xterm to apply the seed (which turns on the running
     * program's bracketed-paste mode) before the paste lands.
     */
    fun contentShown(id: String) {
        val prompt = queuedPrompts.remove(id) ?: return
        session.scope.launch {
            delay(QUEUED_PROMPT_DELAY_MS)
            screens.current(id)?.submit?.invoke(prompt)
        }
    }

    /** The phone's own scrollback for the "terminal output" mention ("" with no screen). */
    fun captureTerminalOutput(id: String, lines: Int, done: (String) -> Unit) {
        val screen = screens.current(id) ?: return done("")
        screen.capture(lines, done)
    }

    // MARK: the terminal list

    fun loadTerminals(project: String) {
        client?.requestTerminals(project)
    }

    fun newTerminal(project: String) = spawnTerminal(project, "New tab") { it.newTerminal(project) }

    /**
     * Ask the Mac for a tab with [send], show a placeholder row until it lands, then
     * hand it to [onSpawn].
     */
    fun spawnTerminal(
        project: String,
        verb: String,
        onSpawn: ((TerminalInfo) -> Unit)? = null,
        send: (LpmClient) -> Unit
    ) {
        session.whenConnected(verb, project) { c ->
            send(c)
            markTerminalCreating(project, onSpawn)
            reloadTerminalsSoon(project)
        }
    }

    /**
     * Ask for a project's tabs again once the link is back. An empty list from before
     * the drop may only mean lpm was restarting, so until the Mac answers it reads as
     * loading rather than as a project with no tabs.
     */
    fun reloadTerminalsAfterReconnect(project: String) {
        mutable.update {
            val empty = it.terminals[project]?.isEmpty() == true
            if (empty) it.copy(terminals = it.terminals - project) else it
        }
        loadTerminals(project)
    }

    /**
     * Show a placeholder row until a list contains an id that wasn't there at request
     * time, or a timeout gives up (a run task that needs the Mac app open never
     * spawned one) and refreshes the list one last time. `onSpawn` is told about the
     * new terminal; any newer create intent replaces it.
     */
    fun markTerminalCreating(project: String, onSpawn: ((TerminalInfo) -> Unit)? = null) {
        spawnCallbacks.remove(project)
        creatingBaseline[project] = state.value.terminals[project].orEmpty().map { it.id }.toSet()
        mutable.update { it.copy(creatingTerminals = it.creatingTerminals + project) }
        creatingTimeout.arm(project, CREATING_TIMEOUT_MS) {
            mutable.update { it.copy(creatingTerminals = it.creatingTerminals - project) }
            creatingBaseline.remove(project)
            spawnCallbacks.remove(project)
            loadTerminals(project)
        }
        if (onSpawn != null) spawnCallbacks[project] = onSpawn
    }

    /**
     * Hide a closing tab. It stays filtered from incoming lists until the Mac's list
     * confirms it gone, or the wait in [awaitClosedTerminal] runs out.
     */
    internal fun hideClosingTerminal(project: String, id: String) {
        closingTerminals[project] = closingTerminals[project].orEmpty() + id
        mutable.update { s ->
            val list = s.terminals[project] ?: return@update s
            s.copy(terminals = s.terminals + (project to list.filterNot { it.id == id }))
        }
    }

    /**
     * Bring back a tab whose close was undone before it reached the Mac, in its old
     * place — unless a list meanwhile showed it gone for another reason.
     */
    internal fun unhideClosingTerminal(tab: TerminalInfo, index: Int) {
        val closing = closingTerminals[tab.project] ?: return
        if (tab.id !in closing) return
        val still = closing - tab.id
        if (still.isEmpty()) {
            closingTerminals.remove(tab.project)
        } else {
            closingTerminals[tab.project] =
                still
        }
        mutable.update { s ->
            val list = s.terminals[tab.project] ?: return@update s
            if (list.any { it.id == tab.id }) return@update s
            val restored = list.toMutableList().apply { add(index.coerceAtMost(size), tab) }
            s.copy(terminals = s.terminals + (tab.project to restored))
        }
    }

    /**
     * The close went to the Mac: per-terminal state elsewhere can go, and the list
     * gets a while to confirm; then a reload shows the tab again if the close failed.
     */
    internal fun awaitClosedTerminal(project: String, id: String) {
        closed.tryEmit(id)
        closingTimeout.arm(id, CLOSING_TIMEOUT_MS) {
            val closing = closingTerminals[project] ?: return@arm
            if (id !in closing) return@arm
            val still = closing - id
            closingTerminals[project] = still
            if (still.isEmpty()) closingTerminals.remove(project)
            loadTerminals(project)
        }
        reloadTerminalsSoon(project)
    }

    // The undo window of [PendingTabClose], running out.
    internal var pendingTabCloseJob: Job? = null

    internal fun setPendingTabClose(pending: PendingTabClose?) {
        mutable.update { it.copy(pendingTabClose = pending) }
    }

    internal fun setAccountMove(id: String, account: String?) {
        mutable.update {
            it.copy(
                accountMoves = if (account == null) {
                    it.accountMoves - id
                } else {
                    it.accountMoves + (id to account)
                }
            )
        }
    }

    internal fun setLimitStopDismissed(id: String, stop: LimitStop) {
        mutable.update { it.copy(dismissedLimitStops = it.dismissedLimitStops + (id to stop)) }
    }

    override fun flushPending() = finishPendingTabClose()

    fun renameTerminal(project: String, id: String, label: String) {
        client?.renameTerminal(project, id, label)
        reloadTerminalsSoon(project)
    }

    fun pinTerminal(project: String, id: String) {
        client?.pinTerminal(project, id)
        reloadTerminalsSoon(project)
    }

    /** The Mac runs ended terminals again in their tabs (`restartTerminal`). */
    val canRestartTerminals: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.RESTART_TERMINAL_FEATURE) == true

    /** Run an ended terminal again in its tab, as the desktop does; [restoredTab] finds it. */
    fun restartTerminal(terminal: TerminalInfo) {
        if (!canRestartTerminals || terminal.id !in state.value.endedTerminals) return
        mutable.update { it.restarting(terminal.id, true) }
        client?.restartTerminal(terminal.project, terminal.id)
        reloadTerminalsSoon(terminal.project)
    }

    /** A restart whose tab never showed up: offer it again. */
    fun restartLapsed(id: String) = mutable.update { it.restarting(id, false) }

    /**
     * Reorder a project's tabs, applied at once so the list doesn't snap back before
     * the desktop echoes it (its terminals push is in tab-tree order).
     */
    fun reorderTerminals(project: String, order: List<String>) {
        mutable.update { s ->
            val list = s.terminals[project] ?: return@update s
            val byId = list.distinctBy { it.id }.associateBy { it.id }
            val reordered = order.mapNotNull { byId[it] }
            if (reordered.size != list.size) return@update s
            s.copy(terminals = s.terminals + (project to reordered))
        }
        client?.reorderTerminals(project, order)
    }

    /**
     * The desktop creates a terminal and types its command asynchronously (it waits
     * for the shell prompt to settle), so poll the list until it shows up.
     */
    fun reloadTerminalsSoon(project: String) {
        for (delayMs in RELOAD_DELAYS_MS) {
            session.scope.launch {
                delay(delayMs)
                loadTerminals(project)
            }
        }
    }

    fun loadSlash(id: String, project: String) {
        client?.requestSlash(id, project)
    }

    fun loadMentions(project: String) {
        client?.requestMentions(project)
    }

    fun loadHistory(project: String, q: String = "") {
        client?.requestHistory(project, q)
    }

    fun recordHistory(project: String, id: String, label: String, text: String) {
        client?.recordHistory(project, id, label, text)
    }

    private companion object {
        const val CREATING_TIMEOUT_MS = 14_000L
        const val CLOSING_TIMEOUT_MS = 10_000L
        const val CLOSED_BUFFER = 16
        const val QUEUED_PROMPT_DELAY_MS = 500L
        val RELOAD_DELAYS_MS = listOf(600L, 1_500L, 3_000L, 5_000L, 8_000L, 12_000L)
    }
}
