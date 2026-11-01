package cx.lpm.mobile.feature.projects.menu

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.agents.AgentLaunchStore
import cx.lpm.mobile.core.data.automations.AutomationsStore
import cx.lpm.mobile.core.data.claude.ClaudeAccountsStore
import cx.lpm.mobile.core.data.files.ProjectFilesStore
import cx.lpm.mobile.core.data.git.GitAutoStore
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.GitNotice
import cx.lpm.mobile.core.data.git.GitOpError
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.projects.ProjectsStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.terminals.TerminalsStore
import cx.lpm.mobile.core.model.AutoPullMode
import cx.lpm.mobile.core.model.AutoPulled
import cx.lpm.mobile.core.model.GitAutoKind
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.core.model.SessionKey
import cx.lpm.mobile.core.model.WorkStatusChoice
import cx.lpm.mobile.core.model.WorkStatusInput
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

/** What a project's "More" menu shows: the project, its Git state and its counts. */
data class ProjectMenuUiState(
    val project: Project? = null,
    /** A Start/Stop is out: the button spins. */
    val pending: Boolean = false,
    /** The Review Changes count; null until Git loads or when it isn't a repo. */
    val changedCount: Int? = null,
    val branch: String = "",
    val ghCli: Boolean = false,
    val pulling: Boolean = false,
    val pushing: Boolean = false,
    val fetching: Boolean = false,
    val undoingAutoPull: Boolean = false,
    val autoPulled: AutoPulled? = null,
    val autoPullMode: AutoPullMode = AutoPullMode.Off,
    /** The project a duplicate follows, for "Same as <parent>". */
    val parent: Project? = null,
    val unreadAutomations: Int = 0,
    val statusChoices: List<WorkStatusChoice> = emptyList(),
    val opError: GitOpError? = null,
    val notice: GitNotice? = null,
    /** The project's Auto Commit / Auto Create PR run while one is going. */
    val autoRunning: GitAutoKind? = null,
    /** The Mac lists the project's folders (Files) and past conversations (Resume Session). */
    val canBrowseFiles: Boolean = false,
    val canResumeSessions: Boolean = false,
    /** The Mac lists the branch's commits (History), and the project isn't on SSH. */
    val canShowHistory: Boolean = false
)

/**
 * The project menu (iOS `ProjectMenuHost` + `ProjectRunControl`), shared by the
 * project's screen and its terminals; Git, automations and the project itself come
 * from the session the project belongs to.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel(assistedFactory = ProjectMenuViewModel.Factory::class)
class ProjectMenuViewModel @AssistedInject constructor(
    @Assisted private val project: String,
    @Assisted private val sessionKey: SessionKey,
    private val sessions: MacSessions
) : ViewModel() {
    private val session: MacSession? get() = sessions[sessionKey]

    val uiState: StateFlow<ProjectMenuUiState> = sessions.session(sessionKey)
        .flatMapLatest { s -> s?.let(::menuState) ?: flowOf(ProjectMenuUiState()) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), ProjectMenuUiState())

    private fun menuState(s: MacSession) = combine(
        s.store<ProjectsStore>().state,
        s.store<GitStore>().state,
        s.store<AutomationsStore>().state,
        s.store<GitAutoStore>().state,
        s.state
    ) { p, git, jobs, auto, _ ->
        val live = p.project(project)
        val snapshot = git.snapshots[project]
        ProjectMenuUiState(
            project = live,
            pending = project in p.pendingRun,
            changedCount = git.changedCount(project),
            branch = snapshot?.branch.orEmpty(),
            ghCli = snapshot?.ghCli ?: false,
            pulling = project in git.pulling,
            pushing = project in git.pushing,
            fetching = project in git.fetching,
            undoingAutoPull = project in git.undoingAutoPull,
            autoPulled = snapshot?.autoPulled,
            autoPullMode = p.autoPullMode,
            parent = live?.let(p::parentProject),
            unreadAutomations = jobs.unread(project),
            statusChoices = p.workStatusMenu,
            opError = git.opError[project],
            notice = git.notice[project],
            autoRunning = auto.runs[project]?.takeIf { it.running }?.kind,
            canBrowseFiles = live != null && s.store<ProjectFilesStore>().canBrowseFiles(live),
            canResumeSessions = live != null && s.store<AgentLaunchStore>().canResumeSessions(live),
            canShowHistory = live != null && s.store<GitHistoryStore>().canShowHistory(live)
        )
    }

    private val projects: ProjectsStore? get() = session?.store()
    private val git: GitStore? get() = session?.store()

    /**
     * The menu's screen came up: its Review Changes count wants a fresh snapshot, and
     * its Claude Account menu the accounts (an SSH project's agents use the far host's).
     */
    fun onAppear() {
        git?.load(project)
        if (projects?.state?.value?.project(project)?.isRemote != true) {
            session?.store<ClaudeAccountsStore>()?.load()
        }
    }

    fun start(profile: String) {
        val p = uiState.value.project ?: return
        projects?.startProject(p, profile)
    }

    fun stop() {
        val p = uiState.value.project ?: return
        projects?.stopProject(p)
    }

    fun rename(name: String) {
        val p = uiState.value.project ?: return
        projects?.renameProject(p, name)
    }

    /** [label] is already trimmed and differs from the tab's name. */
    fun renameTab(id: String, label: String) {
        session?.store<TerminalsStore>()?.renameTerminal(project, id, label)
    }

    fun setWorkStatus(input: WorkStatusInput?) = projects?.setWorkStatus(project, input)

    fun setAutoPull(value: Boolean?) {
        if (value == uiState.value.project?.autoPull) return
        projects?.setAutoPull(project, value)
    }

    fun pull() = git?.pull(project)

    fun push() = git?.push(project)

    fun fetch() = git?.fetch(project)

    fun undoAutoPull() = git?.undoAutoPull(project)

    fun discardAll() = git?.discardAll(project)

    fun dismissOpError() = git?.dismissOpError(project)

    @AssistedFactory
    interface Factory {
        fun create(project: String, sessionKey: SessionKey): ProjectMenuViewModel
    }
}
