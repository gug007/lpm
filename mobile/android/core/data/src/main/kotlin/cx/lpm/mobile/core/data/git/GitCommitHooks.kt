package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.model.CommitHookFailure
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/**
 * A commit a git hook stopped (iOS `GitReviewStore.hookFailures`): the commit sheet's
 * panel in place of the "Commit failed" alert, and the commit as it was asked for,
 * which the panel offers again.
 */
internal class GitCommitHooks(private val mutable: MutableStateFlow<GitState>) {
    /** A commit goes out: the last one's panel goes, and this one is kept. */
    fun asked(project: String, message: String, files: List<String>) = mutable.update {
        val stopped = PendingCommit(message, files, push = project in it.commitPushing)
        it.copy(
            hookFailures = it.hookFailures - project,
            stoppedCommits = it.stoppedCommits + (project to stopped)
        )
    }

    /** The commit's reply said [hook] stopped it, which its panel now shows. */
    fun stopped(project: String, hook: CommitHookFailure) = mutable.update {
        it.copy(
            commitPushing = it.commitPushing - project,
            hookFailures = it.hookFailures + (project to hook)
        )
    }

    fun dismiss(project: String) =
        mutable.update { it.copy(hookFailures = it.hookFailures - project) }
}

/** [pending] as it was asked for, pushing after if it was going to. */
fun GitStore.commit(project: String, pending: PendingCommit, skipHooks: Boolean = false) {
    if (pending.push) {
        commitAndPush(project, pending.message, pending.files, skipHooks)
    } else {
        commit(project, pending.message, pending.files, skipHooks)
    }
}

/** The hook panel's Commit Without Hooks: the stopped commit again with `--no-verify`. */
fun GitStore.commitWithoutHooks(project: String) {
    state.value.stoppedCommits[project]?.let { commit(project, it, skipHooks = true) }
}
