package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestCiFixLoop
import cx.lpm.mobile.core.data.client.requestGitChecks
import cx.lpm.mobile.core.data.client.requestGitChecksRerun
import cx.lpm.mobile.core.data.client.requestGitMergePr
import cx.lpm.mobile.core.data.client.requestGitMergePrCancel
import cx.lpm.mobile.core.data.client.requestGitMergePrWhenReady
import cx.lpm.mobile.core.data.review.noteWin
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.CiFixLoop
import cx.lpm.mobile.core.model.GitChecks
import cx.lpm.mobile.core.model.GitMergeMethod
import cx.lpm.mobile.core.model.GitMergeWatch
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.HapticCue
import cx.lpm.mobile.core.model.MergedPullRequest
import cx.lpm.mobile.core.model.next
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
    val merged: Map<String, MergedPullRequest> = emptyMap(),
    /** Arming or cancelling Merge When Checks Pass, on its way to the Mac. */
    val arming: Set<String> = emptySet(),
    /** How arming it last went, felt while the project's sheet shows. */
    val mergeFeedback: Map<String, HapticCue> = emptyMap(),
    /** Keep fixing until green, by project: running, or how it lately ended. */
    val loops: Map<String, CiFixLoop> = emptyMap(),
    val loopErrors: Map<String, String> = emptyMap()
)

/**
 * CI on each project's branch (iOS `GitChecksStore`): what the Mac last said about
 * it, running the failed jobs again, merging the pull request once it's ready, and
 * keeping an agent fixing until the checks pass. The screens showing it ask again
 * while they're up.
 */
class GitChecksStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GitChecksState())
    val state: StateFlow<GitChecksState> = mutable.asStateFlow()

    private val client: LpmClient? get() = session.client

    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_CHECKS_FEATURE) == true

    val canMerge: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_MERGE_FEATURE) == true

    val canMergeWhenReady: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_MERGE_WHEN_READY_FEATURE) == true

    val canKeepFixing: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.CI_FIX_LOOP_FEATURE) == true

    override fun wire(client: LpmClient) {
        client.onGitChecks = ::apply
        client.onGitChecksRerun = ::applyRerun
        client.onGitMergePr = ::applyMerge
        client.onGitMergeWhenReady = ::applyMergeWhenReady
        client.onGitMergeWatch = ::applyMergeWatch
        client.onCiFixLoop = ::applyLoop
    }

    override fun reset() {
        mutable.value = GitChecksState()
    }

    override fun onConnectionReset() {
        mutable.update {
            it.copy(rerunning = emptySet(), merging = emptySet(), arming = emptySet())
        }
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

    fun merge(
        project: String,
        method: GitMergeMethod,
        deleteBranch: Boolean,
        bypass: Boolean = false
    ) {
        val pr = state.value.results[project]?.pr ?: return
        mutable.update {
            it.copy(merging = it.merging + project, mergeErrors = it.mergeErrors - project)
        }
        client?.requestGitMergePr(
            project,
            pr.number,
            method.wire,
            pr.merge?.head.orEmpty(),
            deleteBranch,
            bypass
        )
    }

    /**
     * Has the Mac merge the pull request the moment its last check passes (the desktop
     * PR card's "When checks pass").
     */
    fun mergeWhenReady(
        project: String,
        method: GitMergeMethod,
        deleteBranch: Boolean,
        bypass: Boolean
    ) {
        val s = state.value
        val checks = s.results[project] ?: return
        val pr = checks.pr ?: return
        if (project in s.arming) return
        val watch = GitMergeWatch(pr.number, pr.title, method, deleteBranch, bypass)
        mutable.update {
            it.copy(
                mergeErrors = it.mergeErrors - project,
                arming = it.arming + project,
                results = it.results.withWatch(project, watch)
            )
        }
        client?.requestGitMergePrWhenReady(project, watch)
    }

    fun cancelMergeWhenReady(project: String) {
        if (project in state.value.arming) return
        mutable.update {
            it.copy(mergeErrors = it.mergeErrors - project, arming = it.arming + project)
        }
        client?.requestGitMergePrCancel(project)
    }

    /**
     * Arms Keep fixing until green for the tab the project opens next; sent right
     * before that tab is asked for.
     */
    fun startLoop(project: String, agent: String) {
        mutable.update { it.copy(loopErrors = it.loopErrors - project) }
        client?.requestCiFixLoop(project, on = true, agent = agent)
    }

    fun stopLoop(project: String) {
        mutable.update { it.copy(loopErrors = it.loopErrors - project) }
        client?.requestCiFixLoop(project, on = false, agent = "")
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
                },
                loops = when {
                    checks == null -> it.loops

                    else -> checks.fixLoop?.let { loop -> it.loops + (project to loop) }
                        ?: (it.loops - project)
                }
            )
        }
    }

    private fun applyLoop(project: String, loop: CiFixLoop?, error: String?) {
        if (error != null) {
            mutable.update { it.copy(loopErrors = it.loopErrors + (project to error)) }
            return
        }
        mutable.update {
            it.copy(loops = if (loop == null) it.loops - project else it.loops + (project to loop))
        }
        if (loop != null && !loop.running) load(project)
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

    private fun applyMergeWhenReady(project: String, cancel: Boolean, error: String?) {
        mutable.update { s ->
            val done = s.copy(arming = s.arming - project)
            when {
                error != null -> done.copy(
                    mergeErrors = s.mergeErrors + (project to error),
                    results = if (cancel) s.results else s.results.withWatch(project, null),
                    mergeFeedback = s.mergeFeedback.cue(project, Haptic.Error)
                )

                cancel -> done.copy(results = s.results.withWatch(project, null))

                else -> done.copy(mergeFeedback = s.mergeFeedback.cue(project, Haptic.Success))
            }
        }
    }

    /** How the Mac's wait to merge stands, wherever it was armed. */
    private fun applyMergeWatch(project: String, watch: GitMergeWatch) {
        when (watch.state) {
            "waiting" -> mutable.update { it.copy(results = it.results.withWatch(project, watch)) }

            "merged" -> {
                mutable.update { s ->
                    val merged = MergedPullRequest(
                        watch.number,
                        watch.title,
                        watch.deletedBranch,
                        isGitLab = s.results[project]?.pr?.isGitLab ?: false
                    )
                    s.copy(
                        results = s.results.withWatch(project, null),
                        merged = s.merged + (project to merged)
                    )
                }
                reloadMerged(project)
            }

            "stopped" -> {
                mutable.update { s ->
                    val ref = if (s.results[project]?.pr?.isGitLab == true) "!" else "#"
                    val message = "Stopped waiting to merge $ref${watch.number}. " +
                        watch.reason.orEmpty()
                    s.copy(
                        results = s.results.withWatch(project, null),
                        mergeErrors = s.mergeErrors + (project to message.trim())
                    )
                }
                if (project in state.value.results) load(project)
            }

            else -> mutable.update { it.copy(results = it.results.withWatch(project, null)) }
        }
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
            val pr = s.results[project]?.pr?.takeIf { it.number == number }
            val merged = MergedPullRequest(
                number,
                pr?.title.orEmpty(),
                deletedBranch,
                isGitLab = pr?.isGitLab ?: false
            )
            s.copy(merging = s.merging - project, merged = s.merged + (project to merged))
        }
        reloadMerged(project)
    }

    /**
     * A merge went through: the branch loads again, and the checks if this phone has
     * them (the sheet loads its own when it opens).
     */
    private fun reloadMerged(project: String) {
        session.noteWin()
        if (project in state.value.results) load(project)
        session.store<GitStore>().load(project)
    }
}

/** [project]'s checks with [watch] as their armed wait; unchanged when there are none. */
private fun Map<String, GitChecks>.withWatch(
    project: String,
    watch: GitMergeWatch?
): Map<String, GitChecks> {
    val checks = this[project] ?: return this
    return this + (project to checks.copy(mergeWatch = watch))
}

private fun Map<String, HapticCue>.cue(project: String, haptic: Haptic) =
    this + (project to this[project].next(haptic))
