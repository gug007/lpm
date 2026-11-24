package cx.lpm.mobile.feature.projects.detail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.actions.ActionsStore
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.git.GitChecksStore
import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.machines.PairedMachineFeeds
import cx.lpm.mobile.core.data.projects.ProjectOpens
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionAlerts
import cx.lpm.mobile.core.data.terminals.AgentTabsStore
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.data.terminals.canMoveTabs
import cx.lpm.mobile.core.data.terminals.canUseTabMenu
import cx.lpm.mobile.core.data.terminals.closeOtherTerminals
import cx.lpm.mobile.core.data.terminals.closeTerminal
import cx.lpm.mobile.core.data.terminals.forkTerminal
import cx.lpm.mobile.core.data.terminals.forkTerminalIntoCopy
import cx.lpm.mobile.core.data.terminals.moveTerminal
import cx.lpm.mobile.core.data.terminals.otherClosableTerminals
import cx.lpm.mobile.core.data.terminals.undoTabClose
import cx.lpm.mobile.core.data.terminals.useConversationTitle
import cx.lpm.mobile.core.data.tips.TipsStore
import cx.lpm.mobile.core.model.AppTip
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.core.navigation.ProjectKey
import cx.lpm.mobile.feature.projects.visit.listedProject
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.flow.stateIn

/** A project's screen (iOS `ProjectDetail`): its tabs and services. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = ProjectDetailViewModel.Factory::class)
class ProjectDetailViewModel @AssistedInject constructor(
    @Assisted val key: ProjectKey,
    private val sessions: MacSessions,
    private val clock: Clock,
    private val feeds: PairedMachineFeeds,
    private val tips: TipsStore,
    private val opens: ProjectOpens
) : ViewModel() {
    private val session: MacSession? get() = sessions[key.session]
    private val projects: ProjectsStore? get() = session?.store()
    private val terminals: TerminalsStore? get() = session?.store()
    private val git: GitStore? get() = session?.store()

    val uiState: StateFlow<ProjectDetailUiState> = sessions.session(key.session)
        .flatMapLatest { s -> s?.let(::detailState) ?: flowOf(ProjectDetailUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProjectDetailUiState())

    /** A project the app icon's New Tab asked to open with its New Tab sheet up. */
    val pendingNewTab: StateFlow<String?> = opens.pendingNewTab

    private val sessionAlerts = (sessions[key.session] ?: sessions.live).alerts
    val alerts: StateFlow<SessionAlerts.Alerts> = sessionAlerts.alerts

    private fun detailState(s: MacSession) = combine(
        combine(s.state, s.link.views, s.link.state, ::Triple),
        s.store<ProjectsStore>().state,
        combine(
            s.store<TerminalsStore>().state,
            s.store<GitStore>().state,
            combine(
                s.store<GitChecksStore>().state,
                s.store<GitExtrasStore>().state.map {
                    it.discussions[key.project]
                }.distinctUntilChanged(),
                ::Pair
            ),
            ::Triple
        ),
        s.store<ActionsStore>().state,
        combine(sessions.listedProject(key, feeds), tips.closed, savedTabs(s), ::Triple)
    ) { (session, view, link), p, (t, g, git), a, (listed, closedTips, saved) ->
        val (ci, discussion) = git
        val inputs = DetailInputs(
            terminals = t.terminals[key.project],
            saved = saved.takeIf { it.isNotEmpty() }
                ?.let { SavedTabs(it, link.listAsOf, view.macLabel) },
            creating = key.project in t.creatingTerminals,
            hasBackgroundRuns = a.runs(key.project).isNotEmpty(),
            live = !session.away,
            statusLine = view.statusLine,
            git = g.snapshots[key.project],
            gitLoading = key.project in g.loading,
            checks = ci.results[key.project]?.takeIf { s.store<GitChecksStore>().available },
            discussion = discussion,
            queued = link.queued(key.project),
            canStopServices = s.store<ProjectsStore>().canRestartServices,
            canLaunchAgents = s.store<AgentLaunchStore>().canLaunchAgents,
            canUseTabMenu = s.store<TerminalsStore>().canUseTabMenu,
            canMoveTabs = s.store<TerminalsStore>().canMoveTabs,
            pendingClose = t.pendingTabClose,
            now = clock.millis(),
            closedTips = closedTips
        )
        p.detail(key.project, inputs, listed)
    }

    /** The agent tabs the phone kept, for a project whose list the Mac can't send now. */
    private fun savedTabs(s: MacSession): Flow<List<TerminalInfo>> =
        combine(s.state, s.store<TerminalsStore>().state) { session, t ->
            session.activeMacId.takeIf { session.away && key.project !in t.terminals }
        }.distinctUntilChanged().mapLatest { mac ->
            if (mac == null) emptyList() else s.store<AgentTabsStore>().savedTabs(key.project)
        }

    /** The branch has a pull request: what its reviewers wrote, at most once a minute. */
    fun loadReview() {
        session?.store<GitExtrasStore>()?.loadDiscussion(key.project)
    }

    /** The screen came up: ask for its tabs again (a switch or reconnect clears them). */
    fun load() {
        terminals?.loadTerminals(key.project)
    }

    /**
     * The link is back: an empty list from before may only mean lpm was restarting,
     * and the Mac's watch reports only the changes made from now on.
     */
    fun reloadAfterReconnect() {
        terminals?.reloadTerminalsAfterReconnect(key.project)
        git?.load(key.project)
    }

    /**
     * The screen came up: its title follows the project's changes while it shows, and
     * the app icon's New Tab offers this project next (a machine visit's projects aren't
     * the live Mac's).
     */
    fun appear() {
        git?.follow(key.project)
        if (key.session == SessionKey.Live) opens.opened(key.project)
    }

    fun disappear() {
        git?.unfollow(key.project)
    }

    /** Takes the app icon's New Tab when it's for this project on the live Mac. */
    fun takePendingNewTab(): Boolean =
        key.session == SessionKey.Live && opens.takeNewTab(key.project)

    /** Read from the store, not [uiState], so a New Tab asked for as the screen comes up sees it. */
    val canLaunchAgents: Boolean
        get() = session?.store<AgentLaunchStore>()?.canLaunchAgents == true

    /** Back in the foreground: catch up on the changes made meanwhile. */
    fun resume() {
        git?.load(key.project)
    }

    fun closeTip(tip: AppTip) = tips.close(tip)

    fun newTerminal() {
        terminals?.newTerminal(key.project)
    }

    /** What New Tab offers, asked for as the screen comes up so the sheet opens ready. */
    fun loadAgentOptions() {
        session?.store<AgentLaunchStore>()?.loadOptions()
    }

    /** A terminal an action spawned belongs to the desktop: claim it before showing it. */
    fun claimControl(id: String) {
        terminals?.claimControl(id)
    }

    fun pin(id: String) {
        terminals?.pinTerminal(key.project, id)
    }

    fun close(id: String) {
        terminals?.closeTerminal(key.project, id)
    }

    fun undoClose() {
        terminals?.undoTabClose()
    }

    fun moveTerminal(term: TerminalInfo, to: String) {
        terminals?.moveTerminal(term, to)
    }

    fun useConversationTitle(term: TerminalInfo) {
        terminals?.useConversationTitle(term)
    }

    /** The fork opens in a tab of its own, handed to [onSpawn] once it lands. */
    fun fork(term: TerminalInfo, onSpawn: (TerminalInfo) -> Unit) {
        terminals?.forkTerminal(term, onSpawn)
    }

    fun forkIntoCopy(term: TerminalInfo) {
        terminals?.forkTerminalIntoCopy(term)
    }

    /** How many unpinned tabs Close Other Tabs would close. */
    fun othersClosable(term: TerminalInfo): Int = terminals?.otherClosableTerminals(term)?.size ?: 0

    fun closeOthers(term: TerminalInfo) {
        terminals?.closeOtherTerminals(term)
    }

    /** [label] is already trimmed and differs from the tab's name (see [tabRenameResult]). */
    fun rename(id: String, label: String) {
        terminals?.renameTerminal(key.project, id, label)
    }

    fun toggleService(service: String) {
        projects?.toggleService(key.project, service)
    }

    fun restartService(service: String) {
        projects?.restartService(key.project, service)
    }

    fun stopService(service: String) {
        projects?.stopService(key.project, service)
    }

    fun cancelQueued(id: String) {
        session?.link?.cancelQueued(id)
    }

    fun retryQueued(id: String) {
        session?.link?.retryQueued(id)
    }

    fun stopAll() {
        val project = uiState.value.project ?: return
        projects?.stopProject(project)
    }

    suspend fun refreshProjects() {
        projects?.refresh()
    }

    fun dismissError() = sessionAlerts.dismissError()

    fun dismissNotice() = sessionAlerts.dismissNotice()

    @AssistedFactory
    interface Factory {
        fun create(key: ProjectKey): ProjectDetailViewModel
    }
}
