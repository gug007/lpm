package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.gitAutoPullUndo
import cx.lpm.mobile.core.data.client.gitCommit
import cx.lpm.mobile.core.data.client.gitCreatePr
import cx.lpm.mobile.core.data.client.gitFetch
import cx.lpm.mobile.core.data.client.gitGenMessage
import cx.lpm.mobile.core.data.client.gitGenPr
import cx.lpm.mobile.core.data.client.gitPull
import cx.lpm.mobile.core.data.client.gitPush
import cx.lpm.mobile.core.data.client.requestGit
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.GitSnapshot
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * Each project's repository snapshot, its diffs and branches, and every Git operation
 * (iOS `GitReviewStore`). Every request arms a timeout so a dropped link can't spin
 * forever; a failure lands in [GitState.opError] (or the sheet's own error).
 */
class GitStore(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(GitState())
    val state: StateFlow<GitState> = mutable.asStateFlow()

    private val timeout = GenerationTimeout<String>(session.scope)
    private val diffs = GitDiffs(session, mutable, timeout)
    private val branches = GitBranches(session, mutable, timeout) { load(it) }
    private val notices = GitNotices(session.scope, mutable)
    private val discards = GitDiscards(session, mutable, timeout, notices) { load(it) }
    private val changedWork = mutableMapOf<String, Job>()

    // Review screens open: only they prefetch every file's diff with the snapshot.
    private val watching = mutableSetOf<String>()

    // Terminal headers open per project, each following its snapshot (see [follow]).
    private val followers = mutableMapOf<String, Int>()

    // Projects whose next snapshot reconciles the loaded diffs against its stamps.
    private val pendingWatchRefresh = mutableSetOf<String>()

    private val client: LpmClient? get() = session.client

    override fun wire(client: LpmClient) {
        val c = client
        c.onGit = ::applySnapshot
        c.onGitDiff = diffs::apply
        // A whole-batch failure is project resolution only; each file's timeout clears its spinner.
        c.onGitDiffs = { project, entries, error ->
            if (error ==
                null
            ) {
                entries.forEach { diffs.apply(project, it.path, it.result, it.error) }
            }
        }
        c.onGitCommit = { project, error -> finish(GitOpCopy.Commit, project, error) }
        c.onGitPush = { project, error -> finish(GitOpCopy.Push, project, error) }
        c.onGitPull = { project, error -> finish(GitOpCopy.Pull, project, error) }
        c.onGitFetch = { project, error -> finish(GitOpCopy.Fetch, project, error) }
        c.onGitAutoPullUndo = { project, error -> finish(GitOpCopy.UndoAutoPull, project, error) }
        c.onGitGenMessage = ::finishGenMessage
        c.onGitGenPr = ::finishGenPr
        c.onGitCreatePr = ::finishCreatePr
        c.onGitChanged = ::changed
        branches.wire(c)
        discards.wire(c)
    }

    override fun reset() {
        timeout.cancelAll()
        diffs.reset()
        notices.reset()
        changedWork.values.forEach { it.cancel() }
        changedWork.clear()
        watching.clear()
        followers.clear()
        pendingWatchRefresh.clear()
        mutable.value = GitState()
    }

    /** Load (or refresh) a project's snapshot; a second load while one is out waits. */
    fun load(project: String) {
        if (project in state.value.loading) return
        mutable.update {
            it.copy(loading = it.loading + project, loadError = it.loadError - project)
        }
        client?.requestGit(project)
        arm("git", project, LOAD_TIMEOUT_MS) {
            if (project !in state.value.loading) return@arm
            mutable.update { s ->
                val error = if (s.snapshots[project] == null) {
                    s.loadError + (project to "Couldn't reach your Mac. Pull to refresh.")
                } else {
                    s.loadError
                }
                s.copy(loading = s.loading - project, loadError = error)
            }
        }
    }

    /** A file's diff, coalesced with the others asked for in the same moment. */
    fun loadDiff(project: String, path: String) = diffs.load(project, path)

    /**
     * The review screen is open: the Mac pushes `git-changed` as the working tree
     * changes (the client re-watches after a reconnect).
     */
    fun watch(project: String) {
        watching += project
        client?.watchGit(project)
    }

    fun unwatch(project: String) {
        watching -= project
        if (project in followers) return
        changedWork.remove(project)?.cancel()
        client?.unwatchGit(project)
    }

    /**
     * A terminal header showing the project's changes: the snapshot follows the
     * working tree while one is open, without the review screen's diff prefetch.
     */
    fun follow(project: String) {
        val count = (followers[project] ?: 0) + 1
        followers[project] = count
        if (count == 1 && project !in watching) client?.watchGit(project)
        load(project)
    }

    fun unfollow(project: String) {
        val count = followers[project] ?: return
        if (count > 1) {
            followers[project] = count - 1
            return
        }
        followers -= project
        if (project in watching) return
        changedWork.remove(project)?.cancel()
        client?.unwatchGit(project)
    }

    /** A `git-changed` push: refresh, a burst collapsed into one. */
    fun changed(project: String) {
        changedWork.remove(project)?.cancel()
        changedWork[project] = session.scope.launch {
            delay(CHANGED_COALESCE_MS)
            changedWork.remove(project)
            refreshWatched(project)
        }
    }

    /** Reload the snapshot, then re-fetch the loaded diffs whose files changed. */
    fun refreshWatched(project: String) {
        pendingWatchRefresh += project
        load(project)
    }

    fun commit(project: String, message: String, files: List<String>) =
        start(GitOpCopy.Commit, project) { it.gitCommit(project, message, files) }

    /** Commit, then push once the commit lands. A failed push keeps the commit. */
    fun commitAndPush(project: String, message: String, files: List<String>) {
        val s = state.value
        if (project in s.committing || project in s.pushing) return
        mutable.update { it.copy(commitPushing = it.commitPushing + project) }
        commit(project, message, files)
    }

    fun genMessage(project: String, files: List<String>) =
        start(GitOpCopy.GenMessage, project) { it.gitGenMessage(project, files) }

    fun pull(project: String) = start(GitOpCopy.Pull, project) { it.gitPull(project) }

    fun push(project: String) = start(GitOpCopy.Push, project) { it.gitPush(project) }

    fun fetch(project: String) = start(GitOpCopy.Fetch, project) { it.gitFetch(project) }

    fun undoAutoPull(project: String) = start(GitOpCopy.UndoAutoPull, project) {
        it.gitAutoPullUndo(project)
    }

    fun discardAll(project: String) = discards.discardAll(project)

    /** Whether the Mac discards one file's changes ("Discard Changes…" on a file). */
    val canDiscardFiles: Boolean get() = discards.canDiscardFiles

    /** Discard one file's changes; the notice offers Undo as for [discardAll]. */
    fun discardFile(project: String, path: String) = discards.discardFile(project, path)

    /** Undo for a discard: put back the copy the Mac kept ([GitNotice.undo]). */
    fun restoreDiscarded(project: String, id: String) = discards.restore(project, id)

    fun genPr(project: String) =
        startPr(GitOp.GenPr, project, "Draft generation timed out. Try again.") {
            it.gitGenPr(project)
        }

    fun createPr(project: String, title: String, body: String) = startPr(
        GitOp.CreatePr,
        project,
        "Pull request creation timed out. Try again."
    ) { it.gitCreatePr(project, title, body) }

    fun loadBranches(project: String) = branches.load(project)

    fun checkout(project: String, branch: String, remote: String) =
        branches.checkout(project, branch, remote)

    /** Create a branch off HEAD and check it out. */
    fun createBranch(project: String, name: String) = branches.create(project, name)

    fun toggleViewed(project: String, path: String) = mutable.update { s ->
        val set = s.viewed[project].orEmpty()
        val next = if (path in set) set - path else set + path
        s.copy(viewed = s.viewed + (project to next))
    }

    fun consumeGeneratedMessage(project: String) =
        mutable.update { it.copy(generatedMessage = it.generatedMessage - project) }

    fun consumePrDraft(project: String) = mutable.update { it.copy(prDraft = it.prDraft - project) }

    fun consumeCreatedPrUrl(project: String) =
        mutable.update { it.copy(createdPrUrl = it.createdPrUrl - project) }

    fun dismissOpError(project: String) = mutable.update { it.copy(opError = it.opError - project) }

    fun dismissPrError(project: String) = mutable.update { it.copy(prError = it.prError - project) }

    fun dismissBranchError(project: String) =
        mutable.update { it.copy(branchError = it.branchError - project) }

    /** A failure from elsewhere (an Auto Commit run) for the project's screen to show. */
    fun showOpError(project: String, error: GitOpError) =
        mutable.update { it.copy(opError = it.opError + (project to error)) }

    private fun applySnapshot(project: String, snapshot: GitSnapshot?, error: String?) {
        timeout.cancel(gitTimeoutKey("git", project))
        if (snapshot == null) {
            mutable.update {
                it.copy(
                    loading = it.loading - project,
                    loadError =
                        it.loadError + (project to (error ?: "Couldn't read the repository."))
                )
            }
            return
        }
        mutable.update {
            it.copy(
                loading = it.loading - project,
                snapshots = it.snapshots + (project to snapshot),
                loadError = it.loadError - project
            )
        }
        if (pendingWatchRefresh.remove(project)) diffs.reconcile(project)
        if (project in watching) diffs.prefetch(project)
    }

    private fun start(copy: GitOpCopy, project: String, send: (LpmClient) -> Unit) {
        val op = copy.op
        if (project in op.running(state.value)) return
        mutable.update { op.mark(it, project, true).copy(opError = it.opError - project) }
        client?.let(send)
        arm(op.name, project, op.timeoutMs) {
            if (project !in op.running(state.value)) return@arm
            finish(copy, project, copy.timedOutMessage)
        }
    }

    private fun finish(copy: GitOpCopy, project: String, error: String?) {
        timeout.cancel(gitTimeoutKey(copy.op.name, project))
        mutable.update { copy.op.mark(it, project, false) }
        if (copy == GitOpCopy.Commit && project in state.value.commitPushing) {
            return finishCommitBeforePush(project, error)
        }
        if (copy == GitOpCopy.Push && project in state.value.commitPushing) {
            return finishPushAfterCommit(project, error)
        }
        // A pull that went through but left conflicts says so itself ("Pulled,
        // but…"), so it isn't called a failure and the new state is fetched.
        if (copy == GitOpCopy.Pull && error != null && error.startsWith("Pulled")) {
            showOpError(project, GitOpError("Pulled with conflicts", error))
            load(project)
            return
        }
        if (error != null) {
            showOpError(project, GitOpError(copy.failed, error))
            return
        }
        copy.done?.let { announce(project, it) }
        if (copy == GitOpCopy.Commit) {
            mutable.update {
                it.copy(commitTick = it.commitTick + (project to (it.commitTick[project] ?: 0) + 1))
            }
        }
        load(project)
    }

    private fun finishCommitBeforePush(project: String, error: String?) {
        if (error != null) {
            mutable.update { it.copy(commitPushing = it.commitPushing - project) }
            showOpError(project, GitOpError(GitOpCopy.Commit.failed, error))
            return
        }
        load(project)
        push(project)
    }

    private fun finishPushAfterCommit(project: String, error: String?) {
        mutable.update {
            it.copy(
                commitPushing = it.commitPushing - project,
                opError = if (error != null) {
                    it.opError + (project to GitOpError("Committed, but not pushed", error))
                } else {
                    it.opError
                },
                commitTick = it.commitTick + (project to (it.commitTick[project] ?: 0) + 1)
            )
        }
        if (error == null) {
            announce(project, "Committed and pushed")
            load(project)
        }
    }

    private fun finishGenMessage(project: String, message: String?, error: String?) {
        timeout.cancel(gitTimeoutKey(GitOp.GenMessage.name, project))
        mutable.update { GitOp.GenMessage.mark(it, project, false) }
        when {
            message != null -> mutable.update {
                it.copy(generatedMessage = it.generatedMessage + (project to message))
            }

            error != null -> showOpError(project, GitOpError(GitOpCopy.GenMessage.failed, error))
        }
    }

    private fun startPr(op: GitOp, project: String, timedOut: String, send: (LpmClient) -> Unit) {
        if (project in op.running(state.value)) return
        mutable.update { op.mark(it, project, true).copy(prError = it.prError - project) }
        client?.let(send)
        arm(op.name, project, op.timeoutMs) {
            if (project !in op.running(state.value)) return@arm
            mutable.update {
                op.mark(it, project, false).copy(prError = it.prError + (project to timedOut))
            }
        }
    }

    private fun finishGenPr(project: String, title: String?, body: String?, error: String?) {
        timeout.cancel(gitTimeoutKey(GitOp.GenPr.name, project))
        mutable.update { GitOp.GenPr.mark(it, project, false) }
        when {
            title != null && body != null -> mutable.update {
                it.copy(prDraft = it.prDraft + (project to GitPrDraft(title, body)))
            }

            error != null -> mutable.update { it.copy(prError = it.prError + (project to error)) }
        }
    }

    private fun finishCreatePr(project: String, url: String?, error: String?) {
        timeout.cancel(gitTimeoutKey(GitOp.CreatePr.name, project))
        mutable.update { GitOp.CreatePr.mark(it, project, false) }
        when {
            url != null -> {
                mutable.update { it.copy(createdPrUrl = it.createdPrUrl + (project to url)) }
                load(project)
            }

            error != null -> mutable.update { it.copy(prError = it.prError + (project to error)) }
        }
    }

    private fun announce(project: String, text: String) = notices.show(project, GitNotice(text))

    private fun arm(op: String, project: String, millis: Long, fire: () -> Unit) =
        timeout.arm(gitTimeoutKey(op, project), millis, fire)

    private companion object {
        const val LOAD_TIMEOUT_MS = 25_000L
        const val CHANGED_COALESCE_MS = 500L
    }
}

/** One op's timeout key for one project. */
internal fun gitTimeoutKey(op: String, project: String) = op + "\u0000" + project
