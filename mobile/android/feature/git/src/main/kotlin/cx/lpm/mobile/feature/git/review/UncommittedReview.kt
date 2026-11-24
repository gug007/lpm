package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.data.git.GitExtrasState
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.git.data.ReviewDraftsState
import cx.lpm.mobile.feature.git.diff.ParsedDiff

/**
 * The review's uncommitted scope (iOS `GitReviewView`'s list): every changed file
 * with its diff, the commit form kept with the review's drafts, and what the look for
 * secrets holds the commit on. Without [listed] (the Branch scope is up) its rows
 * aren't built.
 */
internal fun uncommittedReviewState(
    project: String,
    g: GitState,
    d: ReviewDraftsState,
    e: GitExtrasState,
    terminals: List<TerminalInfo>,
    folds: Folds,
    listed: Boolean,
    focus: String?,
    parsed: Map<String, ParsedDiff>,
    wrap: Boolean,
    canDiscardFiles: Boolean,
    canResolveConflicts: Boolean,
    away: Boolean
): GitReviewUiState {
    val snapshot = g.snapshots[project]
    val files = snapshot?.files.orEmpty()
    val draft = d.draft(project)
    val review = reviewFiles(project, files, g, d, folds, parsed) { it !in draft.deselected }
    val selected = review.count { it.selected }
    val committing = project in g.committing
    val pushing = project in g.pushing
    val pushes = project in g.commitPushing
    val loading = project in g.loading
    val repo = snapshot?.isRepo == true
    val merge = snapshot?.merge?.takeIf { canResolveConflicts }?.let {
        ReviewRow.MergeConflicts(
            merge = it,
            branch = snapshot.branch,
            op = g.conflictOps[project],
            resolving = g.resolvingConflicts[project],
            sides = g.conflictSides[project].orEmpty(),
            away = away
        )
    }
    val overlay = when {
        snapshot != null -> when {
            !snapshot.isRepo -> ReviewOverlay.NotRepo
            files.isEmpty() && merge == null -> ReviewOverlay.NoChanges
            else -> null
        }

        g.loadError[project] != null && !loading -> ReviewOverlay.Unreachable

        else -> ReviewOverlay.Skeleton
    }
    return GitReviewUiState(
        project = project,
        overlay = overlay,
        loadError = g.loadError[project],
        ghCli = snapshot?.ghCli == true,
        rows = if (repo && listed) reviewRows(review, snapshot.ghCli, merge) else emptyList(),
        wrap = wrap,
        commitFiles = if (repo) {
            review.map {
                CommitFile(it.file, it.selected, it.parsed?.addedCount, it.parsed?.removedCount)
            }
        } else {
            emptyList()
        },
        conflicted = files.filter { it.isConflicted }.map { it.path },
        added = review.added,
        removed = review.removed,
        message = draft.message,
        drafted = draft.drafted != null && draft.message == draft.drafted,
        selectedCount = selected,
        branch = snapshot?.takeUnless { it.detached || it.branch.isEmpty() }?.branch,
        generating = project in g.generatingMessage,
        busy = when {
            project in e.scanning && e.pendingPushes(project) -> CommitBusy.Checking
            project in e.scanning -> CommitBusy.CheckingOnly
            committing && pushes -> CommitBusy.Committing
            committing -> CommitBusy.CommittingOnly
            pushing && pushes -> CommitBusy.Pushing
            else -> null
        },
        canCommit = selected > 0 && draft.message.isNotBlank() && !committing && !pushing &&
            project !in e.scanning,
        commitTick = g.commitTick[project] ?: 0,
        opError = g.opError[project],
        notice = g.notice[project],
        canDiscardFiles = canDiscardFiles,
        discarding = project in g.discarding,
        terminals = terminals,
        draft = if (repo) draftChip(draft, files) else null,
        focus = focus,
        findings = e.findings[project].orEmpty(),
        flaggedFiles = e.flaggedFiles(project).size,
        cleanFiles = e.cleanFiles(project).size,
        pendingPushes = e.pendingPushes(project)
    )
}
