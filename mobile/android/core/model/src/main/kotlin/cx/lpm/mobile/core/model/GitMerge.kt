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
    val deletesBranch: Boolean,
    /** GitHub lets this person merge past the rules holding it back. */
    val canBypass: Boolean = false,
    val base: String = ""
) {
    /**
     * The rules on the base branch hold it back, and this person may bypass them (the
     * desktop's `mergeStatus` `bypass`).
     */
    val bypassable: Boolean get() = canBypass && (state == "BLOCKED" || state == "BEHIND")

    val baseName: String get() = base.ifEmpty { "its base branch" }

    companion object {
        fun parse(o: JsonObject): GitMergeOffer {
            val methods = o.strings("methods").orEmpty().mapNotNull(GitMergeMethod::of)
            return GitMergeOffer(
                mergeable = o.string("mergeable").orEmpty(),
                state = o.string("state").orEmpty(),
                review = o.string("review").orEmpty(),
                head = o.string("head").orEmpty(),
                methods = methods.ifEmpty { GitMergeMethod.entries },
                deletesBranch = o.bool("deletesBranch") ?: false,
                canBypass = o.bool("canBypass") ?: false,
                base = o.string("base").orEmpty()
            )
        }
    }
}

/**
 * The Mac's wait to merge a pull request once its checks pass (PROTOCOL.md,
 * MergeWatch), armed from here or at the desk.
 */
data class GitMergeWatch(
    val number: Int,
    val title: String,
    val method: GitMergeMethod,
    val deleteBranch: Boolean,
    val bypass: Boolean,
    /** "waiting", then "merged", "stopped" or "cancelled". */
    val state: String = "waiting",
    val reason: String? = null,
    val deletedBranch: Boolean = false
) {
    val waiting: Boolean get() = state == "waiting"

    /** What it will do, as the desktop's PR card says it (`armedText`). */
    fun armedText(base: String, site: String): String {
        val branch = if (deleteBranch) ", then delete the branch on $site" else ""
        return "${method.label} once the running checks pass${bypassing(bypass, base)}$branch. " +
            "Stops if a check fails."
    }

    companion object {
        fun parse(o: JsonObject?): GitMergeWatch? {
            val number = o?.int("number") ?: return null
            return GitMergeWatch(
                number = number,
                title = o.string("title").orEmpty(),
                method = GitMergeMethod.of(o.string("method")) ?: GitMergeMethod.SQUASH,
                deleteBranch = o.bool("deleteBranch") ?: false,
                bypass = o.bool("bypass") ?: false,
                state = o.string("state").orEmpty(),
                reason = o.string("reason")?.takeIf { it.isNotEmpty() },
                deletedBranch = o.bool("deletedBranch") ?: false
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
data class MergedPullRequest(
    override val number: Int,
    val title: String,
    val deletedBranch: Boolean,
    override val isGitLab: Boolean = false
) : ForgeRef

/** GitHub can't merge the open pull request because it conflicts with its base. */
val GitChecks.conflicts: Boolean
    get() {
        val offer = pr?.merge ?: return false
        return offer.mergeable == "CONFLICTING" || offer.state == "DIRTY"
    }

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
                "Draft ${pr.noun}s can't be merged. " +
                    "Mark it ready for review on ${pr.site}."
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

/** How many checks still run, for "lpm merges once the 3 running checks pass". */
val GitChecks.runningChecks: Int get() = checks.count { it.state == CiCheck.State.PENDING }

/** What Merge When Checks Pass does (the desktop's `waitText`). */
fun GitChecks.waitText(bypass: Boolean): String {
    val running = runningChecks
    val checks = if (running == 1) {
        "the running check passes"
    } else {
        "the $running running checks pass"
    }
    val base = pr?.merge?.baseName ?: "its base branch"
    return "lpm merges once $checks${bypassing(bypass, base)}."
}

/** ", bypassing the rules on main if they still block it" when the merge bypasses them. */
private fun bypassing(bypass: Boolean, base: String): String =
    if (bypass) ", bypassing the rules on $base if they still block it" else ""

private fun GitChecks.readyDetail(offer: GitMergeOffer): String = listOf(
    if (verdict == CiCheck.State.PASS) "All checks passed" else "No checks",
    if (offer.review == "APPROVED") "Approved" else "",
    "No conflicts"
).filter { it.isNotEmpty() }.joinToString(" · ")
