package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.gitDiscardAll
import cx.lpm.mobile.core.data.client.gitDiscardFiles
import cx.lpm.mobile.core.data.client.gitRestoreDiscarded
import cx.lpm.mobile.core.data.session.GenerationTimeout
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.model.lastPathComponent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update

/**
 * Discard all changes, Discard of one file, and their Undo ([GitStore]'s half, iOS
 * `GitReviewStore+Discard`): the Mac keeps a copy for 7 days and names it in the
 * reply, so the notice can offer to put it back. A Mac that keeps no copy (nothing to
 * keep, or an older Mac) gets no Undo. Failures land in [GitState.opError]; [reload]
 * refreshes the snapshot.
 */
internal class GitDiscards(
    private val session: MacSession,
    private val state: MutableStateFlow<GitState>,
    private val timeout: GenerationTimeout<String>,
    private val notices: GitNotices,
    private val reload: (project: String) -> Unit
) {
    private val client: LpmClient? get() = session.client

    fun wire(c: LpmClient) {
        c.onGitDiscardAll = { project, undo, error ->
            finish(GitOpCopy.Discard, project, error)
            if (error == null && undo != null) {
                notices.show(project, GitNotice(DISCARDED, undo), GitNotices.UNDO_NOTICE_MS)
            }
        }
        c.onGitRestoreDiscarded = { project, error ->
            finish(GitOpCopy.RestoreDiscarded, project, error)
        }
        c.onGitDiscardFiles = { project, paths, undo, error ->
            finish(GitOpCopy.Discard, project, error)
            if (error == null) {
                val name = paths.singleOrNull()?.let(::lastPathComponent) ?: "${paths.size} files"
                notices.show(
                    project,
                    GitNotice("Discarded changes to $name", undo),
                    if (undo == null) GitNotices.NOTICE_MS else GitNotices.UNDO_NOTICE_MS
                )
            }
        }
    }

    /** The Mac discards one file's changes and keeps a copy, as for Discard all. */
    val canDiscardFiles: Boolean
        get() = client?.hostFeatures?.contains(LpmClient.GIT_DISCARD_FILES_FEATURE) == true

    fun discardAll(project: String) = start(GitOpCopy.Discard, project) {
        it.gitDiscardAll(project)
    }

    fun discardFile(project: String, path: String) = start(GitOpCopy.Discard, project) {
        it.gitDiscardFiles(project, listOf(path))
    }

    /** Undo on the discard's notice: put back the copy the Mac kept ([GitNotice.undo]). */
    fun restore(project: String, id: String) {
        if (project in state.value.restoringDiscard) return
        notices.dismiss(project)
        start(GitOpCopy.RestoreDiscarded, project) { it.gitRestoreDiscarded(project, id) }
    }

    private fun start(copy: GitOpCopy, project: String, send: (LpmClient) -> Unit) {
        val op = copy.op
        if (project in op.running(state.value)) return
        state.update { op.mark(it, project, true).copy(opError = it.opError - project) }
        client?.let(send)
        timeout.arm(gitTimeoutKey(op.name, project), op.timeoutMs) {
            if (project in op.running(state.value)) finish(copy, project, copy.timedOutMessage)
        }
    }

    /**
     * A failed discard changed nothing; a failed restore can still have put files back
     * with conflict markers, so it reloads like a restore that went through.
     */
    private fun finish(copy: GitOpCopy, project: String, error: String?) {
        timeout.cancel(gitTimeoutKey(copy.op.name, project))
        state.update { copy.op.mark(it, project, false) }
        if (error != null) {
            state.update {
                it.copy(opError = it.opError + (project to GitOpError(copy.failed, error)))
            }
            if (copy == GitOpCopy.Discard) return
        } else {
            copy.done?.let { notices.show(project, GitNotice(it)) }
        }
        reload(project)
    }

    private companion object {
        const val DISCARDED = "Discarded all changes"
    }
}
