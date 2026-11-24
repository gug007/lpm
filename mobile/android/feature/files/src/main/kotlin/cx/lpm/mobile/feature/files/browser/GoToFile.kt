package cx.lpm.mobile.feature.files.browser

import cx.lpm.mobile.core.model.MentionEntry
import cx.lpm.mobile.core.model.trimmingWhitespace

/**
 * Files whose name holds [query] first, then those whose folder path does; changed
 * files lead within each (iOS `goToFileMatches`).
 */
fun goToFileMatches(
    entries: List<MentionEntry>,
    query: String,
    limit: Int = GO_TO_FILE_LIMIT
): List<MentionEntry> {
    val byName = mutableListOf<MentionEntry>()
    val byPath = mutableListOf<MentionEntry>()
    for (entry in entries) {
        if (entry.dir) continue
        when {
            fileName(entry.path).contains(query, ignoreCase = true) -> byName += entry
            entry.path.contains(query, ignoreCase = true) -> byPath += entry
        }
    }
    fun changedFirst(list: List<MentionEntry>) =
        list.filter { it.changed } + list.filterNot { it.changed }
    return (changedFirst(byName) + changedFirst(byPath)).take(limit)
}

/**
 * What in Go to File reads as a path rather than part of a name: one that starts at the
 * home folder or the folder above, or at the root or a leading dot with something after
 * it (iOS `typedPath`).
 */
fun typedPath(query: String): String? {
    val path = query.trimmingWhitespace()
    if (path.startsWith("~/") || path.startsWith("../")) return path
    val start = PATH_STARTS.firstOrNull(path::startsWith) ?: return null
    return path.takeIf { it.length > start.length }
}

/** What follows a path's last slash. */
fun fileName(path: String): String = path.trimEnd('/').substringAfterLast('/')

/** The folder a path is in, empty at the project's root. */
fun folderOf(path: String): String =
    path.trimEnd('/').substringBeforeLast('/', missingDelimiterValue = "")

private const val GO_TO_FILE_LIMIT = 100
private val PATH_STARTS = listOf("/", "./")
