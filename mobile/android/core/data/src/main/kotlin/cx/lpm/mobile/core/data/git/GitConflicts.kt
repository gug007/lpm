package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.gitConflict
import cx.lpm.mobile.core.data.review.noteWin
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.GitConflictOp
import cx.lpm.mobile.core.model.GitMergeRun
import cx.lpm.mobile.core.model.GitMergeState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/**
 * The merge-conflicts panel's actions ([GitStore]'s half, iOS `GitReviewStore+Conflicts`)
 * on a project's merge, pull or rebase that stopped on conflicts. An AI run on them
 * belongs to the Mac: it goes on while the phone is locked, and every step of it comes
 * as a `gitMergeRun`. [refresh] reloads the snapshot and its diffs; [watched] tells
 * whether this phone shows the project.
 */
internal class GitConflicts(
    private val session: MacSession,
    private val state: MutableStateFlow<GitState>,
    private val timeout: GenerationTimeout<String>,
    private val notices: GitNotices,
    private val watched: (project: String) -> Boolean,
    private val refresh: (project: String) -> Unit
) {
    private val client: LpmClient? get() = session.client

    /** The Mac lists a stopped merge's conflicts and works through them. */
    val available: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_CONFLICTS_FEATURE) == true

    fun wire(c: LpmClient) {
        c.onGitConflict = ::finish
        c.onGitMergeRun = ::apply
    }

    fun run(project: String, op: GitConflictOp) {
        if (project in state.value.conflictOps) return
        if (session.state.value.away) return fail(project, GitOpError(op.failed, DISCONNECTED))
        state.update {
            it.copy(
                conflictOps = it.conflictOps + (project to op),
                opError = it.opError - project
            )
        }
        client?.gitConflict(project, op)
        timeout.arm(key(project), if (op is GitConflictOp.Commit) COMMIT_MS else OP_MS) {
            finish(project, op.verb, "It took too long. Check your Mac and try again.")
        }
    }

    private fun finish(project: String, verb: String, error: String?) {
        // A late reply still changed what there is to show.
        val op = state.value.conflictOps[project]?.takeIf { it.verb == verb }
            ?: return refresh(project)
        timeout.cancel(key(project))
        state.update { it.copy(conflictOps = it.conflictOps - project) }
        if (error != null) fail(project, GitOpError(op.failed, error)) else landed(project, op)
        refresh(project)
    }

    private fun landed(project: String, op: GitConflictOp) {
        when (op) {
            is GitConflictOp.Take -> state.update {
                val sides = it.conflictSides[project].orEmpty() + (op.path to op.side)
                it.copy(conflictSides = it.conflictSides + (project to sides))
            }

            is GitConflictOp.Commit -> {
                val branch = state.value.snapshots[project]?.branch.orEmpty()
                notices.show(
                    project,
                    GitNotice(
                        if (op.source.isEmpty()) {
                            "Merge committed"
                        } else {
                            "Merged ${op.source} into $branch"
                        }
                    )
                )
                session.noteWin()
            }

            GitConflictOp.Abort -> notices.show(project, GitNotice("Merge aborted"))

            is GitConflictOp.MarkResolved, GitConflictOp.Resolve, GitConflictOp.Stop -> Unit
        }
    }

    /**
     * A step of an AI run. Only the phone showing the project hears how it ended: the
     * Mac tells every phone.
     */
    private fun apply(run: GitMergeRun) {
        val project = run.project
        if (run.running) {
            state.update {
                it.copy(resolvingConflicts = it.resolvingConflicts + (project to run.line))
            }
            return
        }
        state.update { it.copy(resolvingConflicts = it.resolvingConflicts - project) }
        if (!watched(project)) return
        refresh(project)
        val error = run.error
        val left = run.left
        when {
            error != null -> fail(project, GitOpError(GitConflictOp.Resolve.failed, error))

            left != null && left > 0 -> fail(
                project,
                GitOpError(
                    "Some conflicts are left",
                    if (left == 1) {
                        "1 file still has conflicts."
                    } else {
                        "$left files still have conflicts."
                    }
                )
            )

            left == 0 -> notices.show(
                project,
                GitNotice(
                    if (run.merging) {
                        "Conflicts resolved. Continue the merge."
                    } else {
                        "Conflicts resolved"
                    }
                )
            )
        }
    }

    /** A snapshot says whether a run still goes on, for a phone that missed its end. */
    fun applySnapshot(project: String, merge: GitMergeState?) = state.update {
        val line = merge?.resolving
        val shown = it.resolvingConflicts[project]
        it.copy(
            resolvingConflicts = when {
                line == null -> it.resolvingConflicts - project
                shown == null || line.isNotEmpty() -> it.resolvingConflicts + (project to line)
                else -> it.resolvingConflicts
            },
            conflictSides = if (merge == null) it.conflictSides - project else it.conflictSides
        )
    }

    /** The socket was replaced: a reply on its way went with it, and a run may have ended. */
    fun onConnectionReset() {
        state.value.conflictOps.keys.forEach { timeout.cancel(key(it)) }
        state.update { it.copy(conflictOps = emptyMap()) }
        state.value.resolvingConflicts.keys.forEach(refresh)
    }

    private fun fail(project: String, error: GitOpError) =
        state.update { it.copy(opError = it.opError + (project to error)) }

    private fun key(project: String) = gitTimeoutKey("conflicts", project)

    private companion object {
        const val DISCONNECTED = "Lost the connection to the Mac."
        const val OP_MS = 30_000L

        // A merge commit runs the project's hooks.
        const val COMMIT_MS = 120_000L
    }
}

/** What the alert says when the Mac refuses it. */
private val GitConflictOp.failed: String
    get() = when (this) {
        GitConflictOp.Resolve -> "Couldn't resolve the conflicts"
        GitConflictOp.Stop -> "Couldn't stop"
        GitConflictOp.Abort -> "Couldn't abort the merge"
        is GitConflictOp.Commit -> "Couldn't continue the merge"
        is GitConflictOp.Take -> "Couldn't use ${side.id}"
        is GitConflictOp.MarkResolved -> "Couldn't mark it resolved"
    }
