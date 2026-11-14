package cx.lpm.mobile.feature.git.review

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.data.git.GitNotice
import cx.lpm.mobile.core.data.git.GitOpError
import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.core.model.TerminalInfo
import cx.lpm.mobile.feature.git.data.CommitDraft

/** What the review screen shows instead of its list. */
enum class ReviewOverlay { Skeleton, Unreachable, NotRepo, NoChanges }

/** Which commit-sheet button is running: Commit and Push's commit or push, or Commit only. */
enum class CommitBusy { Committing, Pushing, CommittingOnly }

/**
 * The review screen (iOS `GitReviewView`): its rows, the title's +A −D across every
 * parsed file, the commit sheet's message and files, and the project's terminals for
 * "Ask agent…".
 */
@Immutable
data class GitReviewUiState(
    val project: String = "",
    val overlay: ReviewOverlay? = ReviewOverlay.Skeleton,
    val loadError: String? = null,
    val ghCli: Boolean = false,
    val rows: List<ReviewRow> = emptyList(),
    /** Long diff lines wrap to the screen ("Wrap", one choice for every file). */
    val wrap: Boolean = true,
    val commitFiles: List<CommitFile> = emptyList(),
    /** Files that still have merge conflicts, for the desktop's ConflictNotice. */
    val conflicted: List<String> = emptyList(),
    val added: Int = 0,
    val removed: Int = 0,
    val message: String = "",
    /** The message is the one the Mac drafted from the diff. */
    val drafted: Boolean = false,
    val selectedCount: Int = 0,
    /** The checked-out branch, which Commit and Push sends to origin; null when detached. */
    val branch: String? = null,
    val generating: Boolean = false,
    val busy: CommitBusy? = null,
    val canCommit: Boolean = false,
    /** Bumped by each commit that lands (after its push, if it pushes), which closes the commit sheet. */
    val commitTick: Int = 0,
    val opError: GitOpError? = null,
    val notice: GitNotice? = null,
    /** The Mac discards one file's changes: each file's "…" offers "Discard Changes…". */
    val canDiscardFiles: Boolean = false,
    /** A discard is running for the project, so another waits. */
    val discarding: Boolean = false,
    val terminals: List<TerminalInfo> = emptyList(),
    /** The commit being written, shown over Commit while it has a message or a file left out. */
    val draft: DraftChip? = null,
    /** The file the screen opened on, to scroll to once it's in the list; null once shown. */
    val focus: String? = null
) {
    val committing: Boolean
        get() = busy == CommitBusy.Committing || busy == CommitBusy.CommittingOnly
}

/** A file in the commit sheet: in the commit or not, and its +N −M once parsed. */
@Immutable
data class CommitFile(val file: GitFile, val selected: Boolean, val added: Int?, val removed: Int?)

/** A kept commit draft: its message's first line, and the names of the files left out. */
@Immutable
data class DraftChip(val firstLine: String?, val leftOut: List<String>)

/** The chip for [draft] over the changed [files]; null while there's nothing to keep. */
internal fun draftChip(draft: CommitDraft, files: List<GitFile>): DraftChip? {
    if (draft.isEmpty) return null
    val firstLine = draft.message.split(*NEWLINES).firstOrNull { it.isNotEmpty() }
    return DraftChip(
        firstLine = firstLine?.takeIf { it.isNotBlank() },
        leftOut = files.filter { it.path in draft.deselected }.map { it.name }
    )
}

// Swift's `Character.isNewline`.
private val NEWLINES = charArrayOf('\n', '\r', '\u000B', '\u000C', '\u0085', '\u2028', '\u2029')

/** One "Ask agent…": the file and the diff to attach. */
@Immutable
data class AskContext(val path: String, val diffText: String)
