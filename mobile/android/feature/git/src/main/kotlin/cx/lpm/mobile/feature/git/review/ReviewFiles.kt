package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.data.git.GitDiffKey
import cx.lpm.mobile.core.data.git.GitState
import cx.lpm.mobile.core.model.GitFile
import cx.lpm.mobile.feature.git.data.ReviewDraftsState
import cx.lpm.mobile.feature.git.diff.ParsedDiff

/**
 * A scope's folds: the collapse the user chose per file (a file without a choice is
 * collapsed once it's viewed), and the files shown whole.
 */
internal data class Folds(
    val collapsed: Map<String, Boolean> = emptyMap(),
    val expanded: Set<String> = emptySet()
)

/** [files] with what's loaded for each under [key], whose diffs and Viewed marks they read. */
internal fun reviewFiles(
    key: String,
    files: List<GitFile>,
    g: GitState,
    d: ReviewDraftsState,
    folds: Folds,
    parsed: Map<String, ParsedDiff>,
    selected: (String) -> Boolean = { true }
): List<ReviewFile> {
    val changed = d.changedSinceViewed[key].orEmpty()
    return files.map { file ->
        val diffKey = GitDiffKey(key, file.path)
        val viewed = g.isViewed(key, file.path)
        ReviewFile(
            file = file,
            result = g.diffs[diffKey],
            error = g.diffError[diffKey],
            parsed = parsed[file.path],
            selected = selected(file.path),
            viewed = viewed,
            collapsed = folds.collapsed[file.path] ?: viewed,
            expanded = file.path in folds.expanded,
            changedSince = changed[file.path]
        )
    }
}

internal val List<ReviewFile>.added: Int get() = sumOf { it.parsed?.addedCount ?: 0 }

internal val List<ReviewFile>.removed: Int get() = sumOf { it.parsed?.removedCount ?: 0 }
