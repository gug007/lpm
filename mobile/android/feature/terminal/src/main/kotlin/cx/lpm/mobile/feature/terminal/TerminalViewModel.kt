package cx.lpm.mobile.feature.terminal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.conversation.ConversationStore
import cx.lpm.mobile.core.data.conversation.offersConversation
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.link.LinkView
import cx.lpm.mobile.core.data.link.view
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.data.projects.ProjectsState
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.push.WaitingHeadsUp
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.data.terminals.AgentTabsStore
import cx.lpm.mobile.core.data.terminals.SavedAgentTab
import cx.lpm.mobile.core.data.terminals.TerminalHooks
import cx.lpm.mobile.core.data.terminals.TerminalsState
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.terminals.accountMove
import cx.lpm.mobile.core.data.terminals.canSwitchTabAccounts
import cx.lpm.mobile.core.data.terminals.closeTerminal
import cx.lpm.mobile.core.data.terminals.dismissLimitStop
import cx.lpm.mobile.core.data.terminals.limitStop
import cx.lpm.mobile.core.data.terminals.movedTab
import cx.lpm.mobile.core.data.terminals.restoredTab
import cx.lpm.mobile.core.data.terminals.switchTerminalAccount
import cx.lpm.mobile.core.model.AgentState
import cx.lpm.mobile.core.model.LimitStop
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.model.TerminalViewMode
import cx.lpm.mobile.core.model.agentRow
import cx.lpm.mobile.core.navigation.TerminalKey
import cx.lpm.mobile.feature.terminal.composer.ComposerSessions
import cx.lpm.mobile.feature.terminal.settings.TerminalLook
import cx.lpm.mobile.feature.terminal.settings.setTerminalViewMode
import cx.lpm.mobile.feature.terminal.settings.terminalLook
import cx.lpm.mobile.feature.terminal.settings.terminalLooks
import cx.lpm.mobile.feature.terminal.settings.terminalViewMode
import cx.lpm.mobile.feature.terminal.settings.terminalViewModes
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * One terminal: its stream into the web view (xterm.js renders what the Mac
 * streams and posts keystrokes back), who controls it, and how it ended.
 */
@HiltViewModel(assistedFactory = TerminalViewModel.Factory::class)
class TerminalViewModel @AssistedInject constructor(
    @Assisted private val key: TerminalKey,
    sessions: MacSessions,
    private val prefs: AppPreferences,
    private val clock: Clock
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: TerminalKey): TerminalViewModel
    }

    private val session: MacSession? = sessions[key.session]
    private val terminals = session?.store<TerminalsStore>()
    private val projects = session?.store<ProjectsStore>()
    private val git = session?.store<GitStore>()
    private val agentTabs = session?.store<AgentTabsStore>()

    // The screen is showing, so its title follows the project's changes.
    private var following = false

    // The tab lpm reopened in this one's place after restarting: the screen carries on
    // with it, saying so for a moment. `lastSeen` is the terminal as its list last
    // had it, so a tab gone from the list still shows how it ended.
    private val successor = MutableStateFlow<TerminalInfo?>(null)
    private val lastSeen = MutableStateFlow<TerminalInfo?>(null)
    private val reopened = MutableStateFlow(false)
    private val saved = MutableStateFlow<SavedAgentTab?>(null)
    private val live = MutableStateFlow(false)

    // The Mac whose screen is streaming, which a screen kept later still belongs to.
    private var streamingFrom: String? = null
    private var reopenedTimer: Job? = null
    private var reopenPoll: Job? = null
    private val screenIds = mutableMapOf<Any, String>()

    /** The terminal on screen: the one opened, or the tab that took its place. */
    private val currentId: String get() = successor.value?.id ?: key.terminalId

    val uiState: StateFlow<TerminalUiState> = if (session == null || terminals == null ||
        projects == null || git == null
    ) {
        // A machine visit that has ended: nothing will load.
        MutableStateFlow(TerminalUiState(listLoaded = true))
    } else {
        combine(
            combine(session.state, session.link.views, git.state, ::Triple),
            terminals.state,
            projects.state,
            combine(prefs.terminalLooks(), prefs.terminalViewModes(), conversationRead(), ::Triple),
            combine(lastSeen, reopened, successor, saved, live) { seen, reopen, _, kept, shown ->
                Own(seen, reopen, kept, shown)
            }
        ) { (s, link, g), t, p, (look, view, read), own ->
            build(s, t, p, link, g, look, own).copy(viewMode = view, conversationRead = read)
        }
            .stateIn(
                viewModelScope,
                SharingStarted.WhileSubscribed(5_000),
                build(
                    session.state.value,
                    terminals.state.value,
                    projects.state.value,
                    session.link.view(),
                    git.state.value,
                    prefs.terminalLook,
                    Own(lastSeen.value, reopened.value, saved.value, live.value)
                ).copy(viewMode = prefs.terminalViewMode)
            )
    }

    init {
        if (session != null && terminals != null) {
            combine(terminals.state, successor, ::Pair)
                .onEach { (t, next) -> track(t, next) }
                .launchIn(viewModelScope)
            // lpm restores a project's tabs as it starts up, so its list can take a
            // while to hold the one standing in for this.
            combine(session.state, terminals.state, successor) { s, t, _ ->
                t.endedTerminals[currentId]?.replaceable == true && (s.demoMode || s.isReady)
            }
                .distinctUntilChanged()
                .onEach { awaiting -> if (awaiting) pollForReopen() else reopenPoll?.cancel() }
                .launchIn(viewModelScope)
            combine(session.state, successor) { s, next ->
                (next?.id ?: key.terminalId).takeIf { s.away }
            }
                .distinctUntilChanged()
                .onEach { away ->
                    saved.value = away?.let { agentTabs?.saved(it) }
                    // The tab as its list last had it, while the Mac can't list it.
                    if (away != null && lastSeen.value == null) {
                        lastSeen.value =
                            agentTabs?.savedTabs(key.project)?.firstOrNull { it.id == away }
                    }
                }
                .launchIn(viewModelScope)
            // The Mac's watch reports changes from when it starts, so whatever changed
            // while the link was down is fetched once it's back.
            session.state.map { it.isReady }
                .distinctUntilChanged()
                .drop(1)
                .onEach { ready -> if (ready && following) git?.load(key.project) }
                .launchIn(viewModelScope)
        }
    }

    /** The screen came up: its title follows the project's changes while it shows. */
    fun appear() {
        following = true
        git?.follow(key.project)
    }

    fun disappear() {
        following = false
        git?.unfollow(key.project)
    }

    /** Back in the foreground: catch up on the changes made meanwhile. */
    fun resume() {
        if (following) git?.load(key.project)
    }

    private fun pollForReopen() {
        reopenPoll?.cancel()
        val id = currentId
        reopenPoll = viewModelScope.launch {
            repeat(REOPEN_POLLS) {
                terminals?.loadTerminals(key.project)
                delay(REOPEN_POLL_MS)
            }
            terminals?.restartLapsed(id)
        }
    }

    private fun track(t: TerminalsState, next: TerminalInfo?) {
        val id = next?.id ?: key.terminalId
        t.terminals[key.project]?.firstOrNull { it.id == id }?.let { lastSeen.value = it }
        val shown = lastSeen.value?.takeIf { it.id == id } ?: next ?: return
        (t.movedTab(shown) ?: t.restoredTab(shown))?.let(::follow)
    }

    /** Terminal text a hold picked, added to this tab's prompt as a fenced block. */
    fun addToPrompt(text: String) {
        val term = uiState.value.terminal ?: return
        session?.store<ComposerSessions>()
            ?.store(term.id, term.project, term.label)
            ?.appendQuoted(text)
    }

    /**
     * Carry on with the tab lpm reopened: what was typed here goes with it, and so
     * does control if this phone had it. A restart or a move to another account asked
     * for needs no word that it happened.
     */
    private fun follow(next: TerminalInfo) {
        val store = terminals ?: return
        val old = currentId
        val replacedHere =
            store.state.value.endedTerminals[old]?.restarting == true || next.switchedFrom == old
        if (store.isControlled(old)) store.claimControl(next.id)
        session?.store<ComposerSessions>()?.carryDraft(from = old, to = next)
        live.value = false
        successor.value = next
        if (replacedHere) return
        reopened.value = true
        reopenedTimer?.cancel()
        reopenedTimer = viewModelScope.launch {
            delay(REOPENED_BANNER_MS)
            reopened.value = false
        }
    }

    private fun conversationRead(): Flow<Boolean> {
        val store = session?.store<ConversationStore>() ?: return flowOf(false)
        return store.state.map { it.lists[currentId]?.items.orEmpty().isNotEmpty() }
            .distinctUntilChanged()
    }

    private fun build(
        s: SessionState,
        t: TerminalsState,
        p: ProjectsState,
        link: LinkView,
        g: GitState,
        look: TerminalLook,
        own: Own
    ): TerminalUiState {
        val id = currentId
        val list = t.terminals[key.project]
        val terminal = list?.firstOrNull { it.id == id } ?: own.seen?.takeIf { it.id == id }
        val project = p.project(key.project)
        return TerminalUiState(
            terminal = terminal,
            project = project,
            listLoaded = list != null,
            controlled = terminals?.isControlled(id) ?: true,
            ownerLabel = terminals?.controlOwnerLabel(id).orEmpty(),
            ended = t.endedTerminals[id],
            listed = list?.any { it.id == id } == true,
            canRestart = terminals?.canRestartTerminals == true,
            reopened = own.reopened,
            accountMove = terminal?.let(t::accountMove),
            limitStop = terminal?.let(t::limitStop),
            canSwitchAccount =
                terminals?.canSwitchTabAccounts == true && terminal?.canSwitchAccount == true,
            offersConversation = session?.offersConversation(t, project, id) == true,
            connectionReady = s.isReady,
            saved = own.saved?.takeIf { s.away },
            live = own.live,
            // Drawn for another screen's width, it isn't worth keeping.
            keepsScreen = terminals?.isControlled(id) == true &&
                terminal?.let { agentTabs?.keepsScreen(it) } == true,
            statusLine = link.statusLine.takeUnless { s.demoMode || s.isReady },
            look = look,
            agent = agentTiming(project, id),
            git = g.snapshots[key.project],
            gitLoading = key.project in g.loading,
            activeMacId = s.activeMacId
        )
    }

    /** The tab's agent, as the desktop's sidebar reads it; a plain shell or an idle one has none. */
    private fun agentTiming(project: Project?, terminalId: String): AgentTiming? {
        project ?: return null
        val agent = agentRow(project, terminalId, clock.millis())
            ?.takeIf { it.state != AgentState.Idle }
        return agent?.since?.let { AgentTiming(agent.state, it, agent.until, agent.pause) }
    }

    /** A screen showing the terminal appeared; it streams through `hooks` until [closeScreen]. */
    fun openScreen(screen: Any, hooks: TerminalHooks) {
        // Each screen closes the terminal it opened, even once a reopened tab took over.
        val id = currentId
        screenIds[screen] = id
        streamingFrom = session?.state?.value?.activeMacId
        terminals?.openTerminalScreen(id, screen, hooks)
    }

    fun closeScreen(screen: Any) {
        terminals?.closeTerminalScreen(screenIds.remove(screen) ?: currentId, screen)
    }

    fun input(data: String) {
        terminals?.input(currentId, data)
    }

    fun resize(cols: Int, rows: Int) {
        terminals?.resize(currentId, cols, rows)
    }

    /** Back from the background: ask for the output missed meanwhile. */
    fun resync() {
        terminals?.resync(currentId)
    }

    /** The terminal's first content is on screen: a prompt "Ask agent…" queued goes in. */
    fun contentShown() {
        live.value = true
        terminals?.contentShown(currentId)
    }

    /** The live screen, for reading once the Mac is away. */
    fun keepScreen(text: String, at: Long) {
        val mac = streamingFrom ?: return
        agentTabs?.keepScreen(currentId, text, at, mac)
    }

    /** The page restarted empty: ask for a full snapshot. */
    fun reseed() {
        terminals?.reseed(currentId)
    }

    fun setViewMode(mode: TerminalViewMode) {
        prefs.setTerminalViewMode(mode)
    }

    fun claimControl() {
        terminals?.claimControl(currentId)
    }

    /** Run the ended terminal again in its tab; the screen carries on with it. */
    fun restart() {
        val store = terminals ?: return
        val terminal = uiState.value.terminal ?: return
        store.restartTerminal(terminal)
    }

    /** Carry the stopped conversation on with the account the Mac offers. False when nothing was sent. */
    fun continueAfterLimit(offer: LimitStop.Offer): Boolean {
        val store = terminals ?: return false
        val terminal = uiState.value.terminal ?: return false
        return store.switchTerminalAccount(terminal, offer.account, offer.label)
    }

    fun dismissLimitStop() {
        val store = terminals ?: return
        val terminal = uiState.value.terminal ?: return
        store.dismissLimitStop(terminal)
    }

    fun closeTab() {
        terminals?.closeTerminal(key.project, currentId)
    }

    /**
     * A terminal an action spawned from this screen belongs to the desktop that
     * opened it; claim it for this phone before showing it, so it renders live.
     */
    fun claimSpawned(terminal: TerminalInfo) {
        terminals?.claimControl(terminal.id)
    }

    /** Someone is looking at the terminal: retire the finish or problem it shows. */
    fun markSeen() {
        projects?.markTerminalSeen(key.project, currentId)
    }

    /** Whether [id] is on screen, where its agent starting to wait needs no banner. */
    fun onScreen(id: String, shown: Boolean) {
        val headsUp = session?.store<WaitingHeadsUp>() ?: return
        if (shown) headsUp.showTerminal(id) else headsUp.hideTerminal(id)
    }

    fun loadTerminals() {
        terminals?.loadTerminals(key.project)
    }

    private companion object {
        const val REOPEN_POLLS = 10
        const val REOPEN_POLL_MS = 4_000L
        const val REOPENED_BANNER_MS = 4_000L
    }

    /** What the screen holds itself, beside the session's stores. */
    private data class Own(
        val seen: TerminalInfo?,
        val reopened: Boolean,
        val saved: SavedAgentTab?,
        val live: Boolean
    )
}
