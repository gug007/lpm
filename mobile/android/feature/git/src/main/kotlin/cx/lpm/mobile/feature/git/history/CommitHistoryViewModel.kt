package cx.lpm.mobile.feature.git.history

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import cx.lpm.mobile.core.data.git.GitHistoryState
import cx.lpm.mobile.core.data.git.GitHistoryStore
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.session.MacSessions
import cx.lpm.mobile.core.data.session.SessionState
import cx.lpm.mobile.core.model.CiCheck
import cx.lpm.mobile.core.model.HistoryCommit
import cx.lpm.mobile.core.model.remoteBoundary
import cx.lpm.mobile.core.navigation.GitHistoryKey
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import java.time.Clock
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn

/** The History screen: the branch's commits as far as they're loaded, and how it's going. */
data class CommitHistoryUiState(
    val commits: List<HistoryCommit> = emptyList(),
    /** How recent pushed commits did on CI, by full hash. */
    val checks: Map<String, CiCheck.State> = emptyMap(),
    /** The row the "Pushed" line goes above; null when there's no line. */
    val boundary: Int? = null,
    val hasMore: Boolean = false,
    val loading: Boolean = false,
    val loaded: Boolean = false,
    val error: String? = null,
    val branch: String = "",
    val unpushed: Int = 0,
    /** Every listed commit is unpushed and older ones remain: "N+ not pushed". */
    val unpushedMore: Boolean = false,
    /** The session's link is up, so asking now gets an answer. */
    val ready: Boolean = false,
    /** Unix seconds the relative times count from. */
    val now: Long = 0
) {
    /** A commit's checks are still going, so History asks again every so often. */
    val checksRunning: Boolean get() = CiCheck.State.PENDING in checks.values
}

/** A project's commit history (iOS `CommitHistoryScreen`), from [GitHistoryStore]. */
@HiltViewModel(assistedFactory = CommitHistoryViewModel.Factory::class)
class CommitHistoryViewModel @AssistedInject constructor(
    @Assisted key: GitHistoryKey,
    sessions: MacSessions,
    private val clock: Clock
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(key: GitHistoryKey): CommitHistoryViewModel
    }

    private val project = key.project
    private val session = sessions[key.session]
    private val history: GitHistoryStore? = session?.store()
    private val git: GitStore? = session?.store()

    val uiState: StateFlow<CommitHistoryUiState> = combine(
        history?.state ?: flowOf(GitHistoryState()),
        git?.state ?: flowOf(GitState()),
        session?.state ?: flowOf(SessionState())
    ) { h, g, s -> build(h, g, s) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), CommitHistoryUiState())

    private fun build(h: GitHistoryState, g: GitState, s: SessionState): CommitHistoryUiState {
        val log = h.log(project)
        val unpushed = log.commits.count { it.unpushed }
        return CommitHistoryUiState(
            commits = log.commits,
            checks = h.checks(project),
            boundary = log.commits.remoteBoundary,
            hasMore = log.hasMore,
            loading = log.loading,
            loaded = log.loaded,
            error = log.error,
            branch = g.snapshots[project]?.branch.orEmpty(),
            unpushed = unpushed,
            unpushedMore = log.hasMore && unpushed == log.commits.size,
            ready = s.isReady,
            now = clock.millis() / MILLIS_PER_SECOND
        )
    }

    // The newest page is asked for once per visit to the screen, so coming back from
    // a commit keeps the older pages; a reconnect re-asks through the store.
    private var asked = false

    /** The link is ready: ask for the newest page, unless this visit already has. */
    fun loadOnce() {
        if (asked) return
        asked = true
        load()
    }

    /** The newest page; what's listed stays until it lands. */
    fun load() {
        history?.load(project)
    }

    fun loadMore() {
        history?.loadMore(project)
    }

    fun loadCommitChecks() {
        history?.loadCommitChecks(project)
    }

    /** Pull to refresh: held until the answer lands. */
    suspend fun refresh() {
        history?.refresh(project)
    }

    private companion object {
        const val MILLIS_PER_SECOND = 1_000L
    }
}
