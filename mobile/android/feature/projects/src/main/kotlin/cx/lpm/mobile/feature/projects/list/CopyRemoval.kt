package cx.lpm.mobile.feature.projects.list

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import cx.lpm.mobile.core.model.GitSnapshot
import cx.lpm.mobile.core.model.Project
import cx.lpm.mobile.feature.projects.R

/** What the Remove confirmation knows of a copy's git status, and whether it's being read. */
data class CopyRemovalCheck(val snapshot: GitSnapshot?, val checking: Boolean)

/** Work that exists only in a copy, as the desktop's delete dialog counts it (unsavedWork.ts). */
sealed interface UnsavedWork {
    data class Changed(val count: Int) : UnsavedWork

    data class Untracked(val count: Int) : UnsavedWork

    data class NotPushed(val count: Int) : UnsavedWork

    data class NotOnDefault(val count: Int, val branch: String) : UnsavedWork
}

/**
 * Uncommitted and untracked files, and commits not pushed. Without an upstream the
 * commits count against the default branch, which the Mac sends as `aheadOfDefault`.
 */
fun unsavedWork(s: GitSnapshot): List<UnsavedWork> {
    if (!s.isRepo) return emptyList()
    val untracked = s.files.count { it.status == "untracked" }
    val changed = s.files.filter { it.status != "untracked" }.map { it.path }.toSet().size
    return buildList {
        if (changed > 0) add(UnsavedWork.Changed(changed))
        if (untracked > 0) add(UnsavedWork.Untracked(untracked))
        val ahead = s.aheadOfDefault
        if (s.hasUpstream) {
            if (s.ahead > 0) add(UnsavedWork.NotPushed(s.ahead))
        } else if (ahead != null && ahead > 0 && s.defaultBranch.isNotEmpty()) {
            add(UnsavedWork.NotOnDefault(ahead, s.defaultBranch))
        }
    }
}

/**
 * The branch lpm made for a worktree, deleted with it, unless the project names
 * another. Mirrors projects_crud.rs worktree_branch_name.
 */
fun worktreeBranchName(name: String): String {
    val component = StringBuilder()
    for (ch in name) {
        val keep = ch.code < ASCII_LIMIT && (ch.isLetterOrDigit() || ch == '-' || ch == '_')
        val normalized = if (keep) ch else '-'
        if (normalized != '-' || !component.endsWith('-')) component.append(normalized)
    }
    val trimmed = component.trim('-')
    return "lpm/${trimmed.ifEmpty { "worktree" }}"
}

/** The confirmation's message: what removing deletes, then the work only the copy has. */
@Composable
fun copyRemovalMessage(project: Project, check: CopyRemovalCheck?): String {
    val deletes = if (project.worktree) {
        stringResource(
            R.string.project_remove_worktree_message,
            project.label,
            project.worktreeBranch ?: worktreeBranchName(project.name)
        )
    } else {
        stringResource(R.string.project_remove_message, project.label)
    }
    val snapshot = check?.snapshot
    if (check?.checking == true) {
        return deletes + "\n\n" + stringResource(R.string.project_remove_checking)
    }
    val lines = snapshot?.let(::unsavedWork).orEmpty()
    if (lines.isEmpty()) return deletes
    val bullets = lines.map { stringResource(R.string.project_remove_bullet, unsavedWorkText(it)) }
    return deletes + "\n\n" + stringResource(R.string.project_remove_unsaved) + "\n" +
        bullets.joinToString("\n")
}

@Composable
private fun unsavedWorkText(work: UnsavedWork): String = when (work) {
    is UnsavedWork.Changed ->
        pluralStringResource(R.plurals.project_remove_changed, work.count, work.count)

    is UnsavedWork.Untracked ->
        pluralStringResource(R.plurals.project_remove_untracked, work.count, work.count)

    is UnsavedWork.NotPushed ->
        pluralStringResource(R.plurals.project_remove_not_pushed, work.count, work.count)

    is UnsavedWork.NotOnDefault -> pluralStringResource(
        R.plurals.project_remove_not_on_default,
        work.count,
        work.count,
        work.branch
    )
}

private const val ASCII_LIMIT = 128
