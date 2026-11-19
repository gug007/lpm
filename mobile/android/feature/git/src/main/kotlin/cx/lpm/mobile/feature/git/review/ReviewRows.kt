package cx.lpm.mobile.feature.git.review

import androidx.compose.runtime.Immutable
import cx.lpm.mobile.core.model.GitDiffResult
import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.feature.git.diff.DiffBlock
import cx.lpm.mobile.feature.git.diff.DiffBlockKind
import cx.lpm.mobile.feature.git.diff.ParsedDiff
import java.time.Instant

/** A file Git left with merge conflicts. */
internal val GitFile.isConflicted: Boolean get() = status == "conflicted"

/** One row of the review list, keyed for the lazy list. */
@Immutable
sealed interface ReviewRow {
    val key: String

    /** "4 files changed" (or [title]) and "1 of 4 viewed" over the viewed progress bar. */
    data class Summary(val total: Int, val viewed: Int, val title: String? = null) : ReviewRow {
        override val key get() = "summary"
    }

    /**
     * A file's bar, pinned while its diff scrolls: collapse, status, name over folder
     * with +N −M once parsed, "Excluded" when left out of the commit, viewed, "…".
     * [changedSince] is when its diff changed after it was marked viewed.
     */
    data class FileHeader(
        val file: GitFile,
        val selected: Boolean,
        val collapsed: Boolean,
        val viewed: Boolean,
        val added: Int?,
        val removed: Int?,
        val changedSince: Instant? = null,
        /** False for a file already committed (the Branch scope): no Exclude. */
        val committable: Boolean = true
    ) : ReviewRow {
        val path: String get() = file.path
        override val key get() = "h:$path"
    }

    data class Block(val path: String, val block: DiffBlock) : ReviewRow {
        override val key get() = "b:$path:${block.id}"
    }

    data class Note(val path: String, val note: FileNote) : ReviewRow {
        override val key get() = "n:$path"
    }

    data class ShowAll(val path: String, val total: Int) : ReviewRow {
        override val key get() = "all:$path"
    }

    data object CreatePullRequest : ReviewRow {
        override val key get() = "pr"
    }
}

/** What a file shows instead of its diff. */
@Immutable
sealed interface FileNote {
    data object Binary : FileNote

    data object Empty : FileNote

    data object Loading : FileNote

    data class Failed(val message: String) : FileNote
}

/** One file of the review, with what's loaded for it. */
internal class ReviewFile(
    val file: GitFile,
    val result: GitDiffResult?,
    val error: String?,
    val parsed: ParsedDiff?,
    val selected: Boolean,
    val viewed: Boolean,
    val collapsed: Boolean,
    val expanded: Boolean,
    val changedSince: Instant? = null
)

/**
 * The review list (iOS `GitReviewView`'s `List`): the summary, each file as a header
 * bar and (unless collapsed) its diff, and "Create Pull Request" when the GitHub CLI
 * is there. No changes leaves it empty for the "No changes" overlay.
 */
internal fun reviewRows(files: List<ReviewFile>, ghCli: Boolean): List<ReviewRow> = buildList {
    if (files.isEmpty()) return@buildList
    add(ReviewRow.Summary(files.size, files.count { it.viewed }))
    files.forEach { addFile(it) }
    if (ghCli) add(ReviewRow.CreatePullRequest)
}

/** The Branch scope's list: its heading over the files, read only. */
internal fun branchRows(files: List<ReviewFile>, heading: String): List<ReviewRow> = buildList {
    if (files.isEmpty()) return@buildList
    add(ReviewRow.Summary(files.size, files.count { it.viewed }, heading))
    files.forEach { addFile(it, committable = false) }
}

private fun MutableList<ReviewRow>.addFile(f: ReviewFile, committable: Boolean = true) {
    val path = f.file.path
    add(
        ReviewRow.FileHeader(
            file = f.file,
            selected = f.selected,
            collapsed = f.collapsed,
            viewed = f.viewed,
            added = f.parsed?.addedCount,
            removed = f.parsed?.removedCount,
            changedSince = f.changedSince,
            committable = committable
        )
    )
    if (f.collapsed) return
    val result = f.result
    val note = when {
        result == null -> f.error?.let(FileNote::Failed) ?: FileNote.Loading
        result.binary -> FileNote.Binary
        result.diff.isBlank() -> FileNote.Empty
        f.parsed == null -> FileNote.Loading
        else -> null
    }
    if (note != null) {
        add(ReviewRow.Note(path, note))
        return
    }
    val parsed = f.parsed ?: return
    val blocks = shownBlocks(parsed, f.expanded)
    blocks.forEach { add(ReviewRow.Block(path, it)) }
    if (blocks.size < parsed.blocks.size) add(ReviewRow.ShowAll(path, parsed.lines.size))
}

/**
 * Whole blocks up to the soft line cap unless expanded, so a monster file doesn't lay
 * out thousands of lines at once. A trailing hunk band with nothing under it goes.
 */
internal fun shownBlocks(parsed: ParsedDiff, expanded: Boolean): List<DiffBlock> {
    if (expanded) return parsed.blocks
    val shown = mutableListOf<DiffBlock>()
    var lines = 0
    for (block in parsed.blocks) {
        if (block.kind == DiffBlockKind.Code) {
            if (lines + block.lineCount > SOFT_CAP) break
            lines += block.lineCount
        }
        shown += block
    }
    if (shown.size < parsed.blocks.size && shown.lastOrNull()?.kind == DiffBlockKind.Hunk) {
        shown.removeAt(shown.lastIndex)
    }
    return shown
}

private const val SOFT_CAP = 600
