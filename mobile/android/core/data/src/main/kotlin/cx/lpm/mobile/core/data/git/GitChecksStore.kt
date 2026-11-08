package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestGitChecks
import cx.lpm.mobile.core.data.client.requestGitChecksRerun
import cx.lpm.mobile.core.data.client.requestGitMergePr
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitMergeMethod
import cx.lpm.mobile.core.model.MergedPullRequest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update

data class GitChecksState(
    /** A project with no entry is unknown or has nothing to show. */
    val results: Map<String, GitChecks> = emptyMap(),
    val rerunning: Set<String> = emptySet(),
    val rerunErrors: Map<String, String> = emptyMap(),
    val merging: Set<String> = emptySet(),
    val mergeErrors: Map<String, String> = emptyMap(),
    val merged: Map<String, MergedPullRequest> = emptyMap()
)

/**
 * CI on each project's branch (iOS `GitChecksStore`): what the Mac last said about
 * it, running the failed jobs again, and merging the pull request once it's ready.
 * The screens showing it ask again while they're up.
 */
class GitChecksStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GitChecksState())
    val state: StateFlow<GitChecksState> = mutable.asStateFlow()

    private val client: LpmClient? get() = session.client

    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_CHECKS_FEATURE) == true

    val canMerge: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_MERGE_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onGitChecks = ::apply
        client.onGitChecksRerun = ::applyRerun
        client.onGitMergePr = ::applyMerge
    }

    override fun reset() {
        mutable.value = GitChecksState()
    }

    override fun onConnectionReset() {
        mutable.update { it.copy(rerunning = emptySet(), merging = emptySet()) }
    }

    fun load(project: String) {
        if (!available) return
        client?.requestGitChecks(project)
    }

    fun rerun(project: String) {
        val ids = state.value.results[project]?.failingRunIds.orEmpty()
        if (ids.isEmpty()) return
        mutable.update {
            it.copy(rerunning = it.rerunning + project, rerunErrors = it.rerunErrors - project)
        }
        client?.requestGitChecksRerun(project, ids)
    }

    fun merge(project: String, method: GitMergeMethod, deleteBranch: Boolean) {
        val pr = state.value.results[project]?.pr ?: return
        mutable.update {
            it.copy(merging = it.merging + project, mergeErrors = it.mergeErrors - project)
        }
        client?.requestGitMergePr(
            project,
            pr.number,
            method.wire,
            pr.merge?.head.orEmpty(),
            deleteBranch
        )
    }

    /** The sheet closed: what it said about merging is done with. */
    fun forgetMerge(project: String) {
        mutable.update {
            it.copy(merged = it.merged - project, mergeErrors = it.mergeErrors - project)
        }
    }

    // A failed read keeps what was shown; nothing to show clears it.
    private fun apply(project: String, checks: GitChecks?, error: String?) {
        if (error != null) return
        mutable.update {
            it.copy(
                results = if (checks ==
                    null
                ) {
                    it.results - project
                } else {
                    it.results + (project to checks)
                }
            )
        }
    }

    private fun applyRerun(project: String, error: String?) {
        mutable.update { s ->
            val done = s.copy(rerunning = s.rerunning - project)
            when {
                error != null -> done.copy(rerunErrors = s.rerunErrors + (project to error))

                else -> {
                    val checks = s.results[project] ?: return@update done
                    done.copy(
                        results =
                            s.results + (project to checks.rerunning(checks.failingRunIds))
                    )
                }
            }
        }
        if (error == null) load(project)
    }

    private fun applyMerge(project: String, number: Int, deletedBranch: Boolean, error: String?) {
        if (error != null) {
            mutable.update {
                it.copy(
                    merging = it.merging - project,
                    mergeErrors = it.mergeErrors + (project to error)
                )
            }
            return
        }
        mutable.update { s ->
            val title = s.results[project]?.pr?.takeIf { it.number == number }?.title.orEmpty()
            s.copy(
                merging = s.merging - project,
                merged = s.merged + (project to MergedPullRequest(number, title, deletedBranch))
            )
        }
        load(project)
        session.store<GitStore>().load(project)
    }
}
