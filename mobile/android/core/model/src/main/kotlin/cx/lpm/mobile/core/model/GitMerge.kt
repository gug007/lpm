package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** The ways GitHub merges a pull request, in the order its merge button lists them. */
enum class GitMergeMethod(val wire: String, val label: String) {
    MERGE("merge", "Create a merge commit"),
    SQUASH("squash", "Squash and merge"),
    REBASE("rebase", "Rebase and merge");

    companion object {
        fun of(wire: String?): GitMergeMethod? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * What GitHub says about merging an open pull request (`merge` in `gitChecks`), with
 * the methods the repository allows.
 */
data class GitMergeOffer(
    val mergeable: String,
    val state: String,
    val review: String,
    val head: String,
    val methods: List<GitMergeMethod>,
    /** GitHub deletes the branch by itself once it's merged. */
    val deletesBranch: Boolean
) {
    companion object {
        fun parse(o: JsonObject): GitMergeOffer {
            val methods = o.strings("methods").orEmpty().mapNotNull(GitMergeMethod::of)
            return GitMergeOffer(
                mergeable = o.string("mergeable").orEmpty(),
                state = o.string("state").orEmpty(),
                review = o.string("review").orEmpty(),
                head = o.string("head").orEmpty(),
                methods = methods.ifEmpty { GitMergeMethod.entries },
                deletesBranch = o.bool("deletesBranch") ?: false
            )
        }
    }
}

/** Whether the merge button can go, and what the sheet says when it can't. */
sealed interface GitMergeStatus {
    data class Ready(val detail: String) : GitMergeStatus

    /** GitHub is still working out whether it merges cleanly. */
    data object Checking : GitMergeStatus

    data object WaitingForChecks : GitMergeStatus

    data class Blocked(val detail: String) : GitMergeStatus
}

/** A pull request this phone just merged, shown until the sheet closes. */
data class MergedPullRequest(val number: Int, val title: String, val deletedBranch: Boolean)

/**
 * How the open pull request stands on merging; null when there's none, or while its
 * checks fail and the sheet's fixes come first.
 */
val GitChecks.mergeStatus: GitMergeStatus?
    get() {
        val pr = pr ?: return null
        val offer = pr.merge ?: return null
        if (pr.isDraft || offer.state == "DRAFT") {
            return GitMergeStatus.Blocked(
                "Draft pull requests can't be merged. Mark it ready for review on GitHub."
            )
        }
        when (verdict) {
            CiCheck.State.FAIL -> return null
            CiCheck.State.PENDING -> return GitMergeStatus.WaitingForChecks
            else -> Unit
        }
        if (offer.mergeable == "CONFLICTING" || offer.state == "DIRTY") {
            return GitMergeStatus.Blocked("This branch has conflicts with its base branch.")
        }
        return when (offer.state) {
            "CLEAN", "HAS_HOOKS", "UNSTABLE" -> GitMergeStatus.Ready(readyDetail(offer))

            "BEHIND" -> GitMergeStatus.Blocked(
                "This branch is behind its base branch. Update it before merging."
            )

            "BLOCKED" -> GitMergeStatus.Blocked(
                when (offer.review) {
                    "CHANGES_REQUESTED" -> "A reviewer asked for changes."
                    "REVIEW_REQUIRED" -> "A review is required before merging."
                    else -> "The base branch's rules don't allow merging yet."
                }
            )

            else -> GitMergeStatus.Checking
        }
    }

private fun GitChecks.readyDetail(offer: GitMergeOffer): String = listOf(
    if (verdict == CiCheck.State.PASS) "All checks passed" else "No checks",
    if (offer.review == "APPROVED") "Approved" else "",
    "No conflicts"
).filter { it.isNotEmpty() }.joinToString(" · ")
