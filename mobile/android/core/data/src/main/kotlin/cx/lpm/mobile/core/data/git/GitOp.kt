package cx.lpm.mobile.core.data.git

/**
 * A Git request with a spinner of its own: the set of projects it's in flight for,
 * and how long the Mac gets to answer before the spinner gives up.
 */
internal enum class GitOp(val timeoutMs: Long) {
    Pull(LONG_MS),
    Push(LONG_MS),
    Fetch(LONG_MS),
    Commit(LONG_MS),
    GenMessage(LONG_MS),
    GenPr(LONG_MS),
    CreatePr(LONG_MS),
    Discard(SHORT_MS),
    RestoreDiscarded(SHORT_MS),
    UndoAutoPull(SHORT_MS),
    Branches(30_000),
    CreateBranch(30_000)
    ;

    fun running(s: GitState): Set<String> = when (this) {
        Pull -> s.pulling
        Push -> s.pushing
        Fetch -> s.fetching
        Commit -> s.committing
        GenMessage -> s.generatingMessage
        GenPr -> s.generatingPr
        CreatePr -> s.creatingPr
        Discard -> s.discarding
        RestoreDiscarded -> s.restoringDiscard
        UndoAutoPull -> s.undoingAutoPull
        Branches -> s.branchesLoading
        CreateBranch -> s.creatingBranch
    }

    fun mark(s: GitState, project: String, on: Boolean): GitState {
        val next = if (on) running(s) + project else running(s) - project
        return when (this) {
            Pull -> s.copy(pulling = next)
            Push -> s.copy(pushing = next)
            Fetch -> s.copy(fetching = next)
            Commit -> s.copy(committing = next)
            GenMessage -> s.copy(generatingMessage = next)
            GenPr -> s.copy(generatingPr = next)
            CreatePr -> s.copy(creatingPr = next)
            Discard -> s.copy(discarding = next)
            RestoreDiscarded -> s.copy(restoringDiscard = next)
            UndoAutoPull -> s.copy(undoingAutoPull = next)
            Branches -> s.copy(branchesLoading = next)
            CreateBranch -> s.copy(creatingBranch = next)
        }
    }
}

/** How a failed op reads in the alert, and what a finished one announces. */
internal enum class GitOpCopy(
    val op: GitOp,
    val failed: String,
    val timedOutMessage: String,
    val done: String?
) {
    Pull(GitOp.Pull, "Pull failed", "Pull timed out. Check your Mac and try again.", "Pulled"),
    Push(GitOp.Push, "Push failed", "Push timed out. Check your Mac and try again.", "Pushed"),
    Fetch(
        GitOp.Fetch,
        "Fetch failed",
        "Fetch timed out. Check your Mac and try again.",
        "Fetched"
    ),
    Commit(
        GitOp.Commit,
        "Commit failed",
        "Commit timed out. Check your Mac and try again.",
        "Committed successfully"
    ),
    GenMessage(
        GitOp.GenMessage,
        "Couldn't write a message",
        "Message generation timed out. Try again.",
        null
    ),
    Discard(
        GitOp.Discard,
        "Couldn't discard changes",
        "Discarding changes timed out. Try again.",
        null
    ),
    RestoreDiscarded(
        GitOp.RestoreDiscarded,
        "Couldn't restore the changes",
        "Restoring the changes timed out. Check your Mac and try again.",
        "Restored the discarded changes"
    ),
    UndoAutoPull(
        GitOp.UndoAutoPull,
        "Couldn't undo the auto pull",
        "Undoing the auto pull timed out. Check your Mac and try again.",
        null
    )
}

private const val LONG_MS = 120_000L
private const val SHORT_MS = 60_000L
