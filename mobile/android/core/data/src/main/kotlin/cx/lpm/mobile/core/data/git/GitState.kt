package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.model.GitSnapshot
import java.util.UUID

/** A failed Git operation as the alert shows it: "Pull failed" over what Git said. */
data class GitOpError(val title: String, val message: String)

/**
 * A finished Git op's short confirmation ("Pulled", "Pushed", "Fetched"). Every
 * notice is distinct, so the same op finishing twice in a row shows again. A discard
 * the Mac kept a copy of carries that copy's id in [undo], and the notice offers Undo.
 */
data class GitNotice(
    val text: String,
    val undo: String? = null,
    val id: String = UUID.randomUUID().toString()
)

/** A pull request title and body the Mac drafted. */
data class GitPrDraft(val title: String, val body: String)

/** One changed file of one project, the key of its diff. */
data class GitDiffKey(val project: String, val path: String)

/**
 * Each project's repository snapshot, its files' diffs, and the Git operations in
 * flight. A failed op lands in [opError]; the pull request sheet's own failures in
 * [prError], the branch sheet's in [branchError], so an open sheet's error doesn't
 * also fire the screen's alert. [generatedMessage], [prDraft] and [createdPrUrl] are
 * replies the screen takes once (`consume…`); [commitTick] and [checkoutTick] count
 * successes the screens react to.
 */
data class GitState(
    val snapshots: Map<String, GitSnapshot> = emptyMap(),
    val loadError: Map<String, String> = emptyMap(),
    val loading: Set<String> = emptySet(),
    val pulling: Set<String> = emptySet(),
    val pushing: Set<String> = emptySet(),
    val fetching: Set<String> = emptySet(),
    val discarding: Set<String> = emptySet(),
    val restoringDiscard: Set<String> = emptySet(),
    val undoingAutoPull: Set<String> = emptySet(),
    val committing: Set<String> = emptySet(),
    /**
     * Commits that push once they land (the commit sheet's Commit and Push), kept until
     * that push finishes: [commitTick] counts the commit then.
     */
    val commitPushing: Set<String> = emptySet(),
    val generatingMessage: Set<String> = emptySet(),
    val generatingPr: Set<String> = emptySet(),
    val creatingPr: Set<String> = emptySet(),
    /** A failed op, presented by whichever of the project's screens is showing. */
    val opError: Map<String, GitOpError> = emptyMap(),
    val prError: Map<String, String> = emptyMap(),
    val notice: Map<String, GitNotice> = emptyMap(),
    val generatedMessage: Map<String, String> = emptyMap(),
    val commitTick: Map<String, Int> = emptyMap(),
    val prDraft: Map<String, GitPrDraft> = emptyMap(),
    val createdPrUrl: Map<String, String> = emptyMap(),
    val diffs: Map<GitDiffKey, GitDiffResult> = emptyMap(),
    val diffLoading: Set<GitDiffKey> = emptySet(),
    val diffError: Map<GitDiffKey, String> = emptyMap(),
    /** Files marked "viewed" on the review screen, by project; kept across refreshes. */
    val viewed: Map<String, Set<String>> = emptyMap(),
    val branches: Map<String, List<GitBranch>> = emptyMap(),
    val currentBranch: Map<String, String> = emptyMap(),
    val branchesLoading: Set<String> = emptySet(),
    val branchError: Map<String, String> = emptyMap(),
    /** The branch each project is switching to. */
    val checkingOut: Map<String, String> = emptyMap(),
    val checkoutTick: Map<String, Int> = emptyMap(),
    val creatingBranch: Set<String> = emptySet()
) {
    /** The Review Changes count; null until a snapshot loads or when it isn't a repo. */
    fun changedCount(project: String): Int? = snapshots[project]?.takeIf { it.isRepo }?.files?.size

    fun isViewed(project: String, path: String): Boolean = viewed[project]?.contains(path) == true
}
