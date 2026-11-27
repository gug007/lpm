package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.data.git.commitWithoutHooks

/**
 * The commit sheet's answers to a git hook that stopped the commit (the desktop's
 * CommitHookPanel): an agent fixes what it found, try again, or commit without the
 * hooks. [asked] is the commit the sheet holds now, for a stopped one it can't name.
 */
class CommitHookCheck internal constructor(
    private val project: String,
    private val git: GitStore?,
    private val extras: GitExtrasStore?,
    private val asked: () -> Pair<String, List<String>>
) {
    /**
     * Try Again: the stopped commit as it was asked for, files a formatter rewrote
     * going in with it, through the look for secrets as the sheet's own Commit is.
     */
    fun retry() {
        val stopped = git?.state?.value?.stoppedCommits?.get(project) ?: return
        git.dismissHookFailure(project)
        extras?.commit(project, stopped.message, stopped.files, stopped.push)
    }

    fun commitWithoutHooks() {
        git?.commitWithoutHooks(project)
    }

    fun dismiss() {
        git?.dismissHookFailure(project)
    }

    /** What a Fix with … agent is told: the stopped commit and what the hook printed. */
    fun prompt(): String? {
        val s = git?.state?.value ?: return null
        val failure = s.hookFailures[project] ?: return null
        val stopped = s.stoppedCommits[project]
        val (message, files) = asked()
        return failure.prompt(stopped?.message ?: message, stopped?.files ?: files)
    }
}
