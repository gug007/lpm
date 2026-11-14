package cx.lpm.mobile.feature.git.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.git.GitDiffKey
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import java.time.Clock
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * What the review screen keeps while it comes and goes (iOS `GitReviewStore+Drafts`):
 * each project's commit being written, and the viewed files whose diff changed since
 * they were marked, which lose Viewed.
 */
class ReviewDraftsStore(
    private val session: MacSession,
    private val clock: Clock = Clock.systemUTC()
) : SessionStore {
    private val mutable = MutableStateFlow(ReviewDraftsState())
    val state: StateFlow<ReviewDraftsState> = mutable.asStateFlow()

    // The diff each viewed file had when it was marked.
    private val viewedDiff = mutableMapOf<GitDiffKey, Int>()
    private var commitTicks: Map<String, Int> = emptyMap()
    private var diffWatch: Job? = null

    private val git: GitStore get() = session.store()

    override fun wire(client: LpmClient) {
        if (diffWatch != null) return
        commitTicks = git.state.value.commitTick
        diffWatch = session.scope.launch {
            git.state.collect { s ->
                noteViewedDiffs(s)
                clearCommitted(s.commitTick)
            }
        }
    }

    // A machine visit's session is dropped after its reset, so the watch goes with it.
    override fun reset() {
        diffWatch?.cancel()
        diffWatch = null
        viewedDiff.clear()
        commitTicks = emptyMap()
        mutable.value = ReviewDraftsState()
    }

    fun toggleViewed(project: String, path: String) {
        val key = GitDiffKey(project, path)
        val s = git.state.value
        val hash = s.diffs[key]?.diff?.hashCode()
        if (s.isViewed(project, path) || hash == null) viewedDiff -= key else viewedDiff[key] = hash
        git.toggleViewed(project, path)
        clearChanged(project, path)
    }

    fun updateDraft(project: String, change: (CommitDraft) -> CommitDraft) = mutable.update { s ->
        val next = change(s.draft(project))
        val others = s.commitDrafts - project
        s.copy(commitDrafts = if (next == CommitDraft()) others else others + (project to next))
    }

    fun clearCommitDraft(project: String) =
        mutable.update { it.copy(commitDrafts = it.commitDrafts - project) }

    /**
     * A viewed file's diff arrived: remember it if the file was marked before its diff
     * loaded, or take Viewed away when it isn't the diff that was seen.
     */
    private fun noteViewedDiffs(s: GitState) {
        for ((project, paths) in s.viewed) {
            for (path in paths) {
                val key = GitDiffKey(project, path)
                val hash = s.diffs[key]?.diff?.hashCode() ?: continue
                val seen = viewedDiff[key]
                if (seen == null) {
                    viewedDiff[key] = hash
                } else if (seen != hash) {
                    viewedDiff -= key
                    if (git.state.value.isViewed(project, path)) git.toggleViewed(project, path)
                    markChanged(project, path)
                }
            }
        }
    }

    /** A commit that landed takes its draft with it, whether or not Changes is open. */
    private fun clearCommitted(ticks: Map<String, Int>) {
        if (ticks == commitTicks) return
        val landed = ticks.filter { (project, tick) -> tick != commitTicks[project] }.keys
        commitTicks = ticks
        mutable.update { it.copy(commitDrafts = it.commitDrafts - landed) }
    }

    private fun markChanged(project: String, path: String) = mutable.update { s ->
        val paths = s.changedSinceViewed[project].orEmpty() + (path to clock.instant())
        s.copy(changedSinceViewed = s.changedSinceViewed + (project to paths))
    }

    private fun clearChanged(project: String, path: String) = mutable.update { s ->
        val paths = s.changedSinceViewed[project] ?: return@update s
        s.copy(changedSinceViewed = s.changedSinceViewed + (project to paths - path))
    }
}
