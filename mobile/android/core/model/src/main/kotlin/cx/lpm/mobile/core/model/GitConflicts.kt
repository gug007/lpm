package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** One file of a merge that stopped on conflicts. */
data class GitConflictFile(
    val path: String,
    /** Conflicts left in the file. */
    val conflicts: Int,
    /** The line the first of them is on, 0 when none is left. */
    val firstLine: Int,
    val resolved: Boolean
) {
    companion object {
        fun parse(o: JsonObject): GitConflictFile = GitConflictFile(
            path = o.string("path").orEmpty(),
            conflicts = o.int("conflicts") ?: 0,
            firstLine = o.int("firstLine") ?: 0,
            resolved = o.bool("resolved") ?: false
        )
    }
}

/** Whose version of a file to keep: this branch's or the incoming one's. */
enum class GitConflictSide(val id: String) { Ours("ours"), Theirs("theirs") }

/** What a merge, a pull or a rebase left to work through (`git`'s `merge`). */
data class GitMergeState(
    /**
     * A merge is in progress, so it can be continued or aborted; a rebase's or a
     * stash's conflicts can only be worked through.
     */
    val merging: Boolean,
    val source: String,
    val files: List<GitConflictFile>,
    /** What the AI working through them is doing; null when none is. */
    val resolving: String?
) {
    val remaining: Int get() = files.count { !it.resolved }

    companion object {
        fun parse(o: JsonObject?): GitMergeState? {
            if (o == null) return null
            val files = o.list("files", GitConflictFile::parse)
            if (files.isEmpty()) return null
            return GitMergeState(
                merging = o.bool("merging") ?: false,
                source = o.string("source").orEmpty(),
                files = files,
                resolving = o.obj("resolving")?.let { it.string("line").orEmpty() }
            )
        }
    }
}

/** A step of an AI run on a project's conflicts, whoever started it. */
data class GitMergeRun(
    val project: String,
    val running: Boolean,
    val line: String,
    /** Ended without failing: the files that still have conflicts. */
    val left: Int?,
    /** Ended: a merge is left to commit. */
    val merging: Boolean,
    val error: String?
) {
    companion object {
        fun parse(o: JsonObject): GitMergeRun = GitMergeRun(
            project = o.string("project").orEmpty(),
            running = o.bool("running") ?: false,
            line = o.string("line").orEmpty(),
            left = o.int("left"),
            merging = o.bool("merging") ?: false,
            error = o.string("error")
        )
    }
}

/** What the phone asked the Mac to do about a project's conflicts. */
sealed interface GitConflictOp {
    data object Resolve : GitConflictOp
    data object Stop : GitConflictOp
    data object Abort : GitConflictOp

    /** Commits the merge of [source]. */
    data class Commit(val source: String) : GitConflictOp
    data class Take(val path: String, val side: GitConflictSide) : GitConflictOp
    data class MarkResolved(val path: String) : GitConflictOp

    /** The request it sends, which its reply is named by. */
    val verb: String
        get() = when (this) {
            Resolve -> "gitMergeResolve"
            Stop -> "gitMergeStop"
            Abort -> "gitMergeAbort"
            is Commit -> "gitMergeContinue"
            is Take -> "gitConflictTake"
            is MarkResolved -> "gitConflictResolved"
        }
}
