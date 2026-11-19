package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.data.git.GitExtrasState
import cx.lpm.mobile.core.data.git.GitExtrasStore
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.model.BranchScope
import cx.lpm.mobile.feature.git.data.ReviewDraftsState
import cx.lpm.mobile.feature.git.diff.ParsedDiff

/**
 * Changes' Branch scope (iOS `GitBranchReviewList`): every file the branch's own
 * commits changed since it left its base, each with its diff and a Viewed mark of its
 * own under the branch key, read only. [ready] is the screen as the uncommitted
 * scope built it, whose commit form stays as it was.
 */
internal fun branchReviewState(
    ready: GitReviewUiState,
    project: String,
    g: GitState,
    d: ReviewDraftsState,
    e: GitExtrasState,
    folds: Folds,
    parsed: Map<String, ParsedDiff>
): GitReviewUiState {
    val branch = e.branchScopes[project]
    val review =
        reviewFiles(GitExtrasStore.branchKey(project), branch?.files.orEmpty(), g, d, folds, parsed)
    val overlay = when {
        branch != null && branch.files.isEmpty() -> if (branch.range == BranchScope.Range.SINCE) {
            ReviewOverlay.BranchNoCommits
        } else {
            ReviewOverlay.BranchAllPushed
        }

        branch != null -> null

        project in e.branchLoaded -> ReviewOverlay.BranchNothing

        e.branchErrors[project] != null && project !in e.branchLoading ->
            ReviewOverlay.BranchUnreachable

        else -> ReviewOverlay.Skeleton
    }
    return ready.copy(
        overlay = overlay,
        loadError = e.branchErrors[project],
        rows = branch?.let { branchRows(review, it.heading) }.orEmpty(),
        added = review.added,
        removed = review.removed,
        canDiscardFiles = false
    )
}
