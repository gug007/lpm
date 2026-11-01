package cx.lpm.mobile.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/** One commit of the current branch, as the Mac's `gitHistory` lists it. */
@Serializable
data class HistoryCommit(
    val hash: String,
    val short: String,
    val subject: String,
    val body: String,
    val author: String,
    val email: String,
    /** Author time, unix seconds. */
    val time: Long,
    val parents: Int,
    /** "Name <email>" from each Co-authored-by trailer. */
    val coAuthors: List<String>,
    /** On no remote branch yet; false everywhere when there is no remote. */
    val unpushed: Boolean
) {
    val id: String get() = hash
    val isMerge: Boolean get() = parents > 1

    /** The coding agent a co-author trailer credits, as the desktop marks it. */
    val agent: String?
        get() = coAuthors.firstNotNullOfOrNull { coAuthor ->
            agentMarks.firstOrNull { it.second.containsMatchIn(coAuthor) }?.first
        }

    /** Each co-author's name without the address: "Claude Opus 5.5". */
    val coAuthorNames: List<String>
        get() = coAuthors.map { coAuthor ->
            val name = coAuthor.replace(addressSuffix, "").trim(' ', '\t')
            name.ifEmpty { coAuthor }
        }

    /** The whole commit message, subject and body, as Copy Message copies it. */
    val fullMessage: String get() = if (body.isEmpty()) subject else subject + "\n\n" + body

    /** The message under the subject, without the trailer lines the header shows. */
    val message: String
        get() = body.split("\n")
            .filterNot { it.trim(' ', '\t').lowercase().startsWith("co-authored-by:") }
            .joinToString("\n")
            .trimmingWhitespace()

    companion object {
        fun parse(o: JsonObject): HistoryCommit {
            val hash = o.string("hash").orEmpty()
            return HistoryCommit(
                hash = hash,
                short = o.string("short") ?: hash.take(7),
                subject = o.string("subject").orEmpty(),
                body = o.string("body").orEmpty(),
                author = o.string("author").orEmpty(),
                email = o.string("email").orEmpty(),
                time = o.long("time") ?: 0,
                parents = o.int("parents") ?: 1,
                coAuthors = o.strings("coAuthors").orEmpty(),
                unpushed = o.bool("unpushed") ?: false
            )
        }

        private val agentMarks = listOf(
            "claude" to Regex("""\bclaude\b|@anthropic\.com""", RegexOption.IGNORE_CASE),
            "codex" to Regex("""\bcodex\b|@openai\.com""", RegexOption.IGNORE_CASE),
            "gemini" to Regex("""\bgemini\b""", RegexOption.IGNORE_CASE),
            "opencode" to Regex("""\bopencode\b""", RegexOption.IGNORE_CASE)
        )

        private val addressSuffix = Regex("""\s*<[^>]*>\s*$""")
    }
}

/** A page of history: the commits after `skip`, and whether older ones remain. */
data class HistoryPage(val commits: List<HistoryCommit>, val hasMore: Boolean) {
    companion object {
        fun parse(o: JsonObject): HistoryPage = HistoryPage(
            commits = o.list("commits", HistoryCommit::parse),
            hasMore = o.bool("hasMore") ?: false
        )
    }
}

/** A file one commit changed, against its first parent. */
@Serializable
data class CommitFile(
    val path: String,
    /** Where a renamed file came from. */
    val oldPath: String?,
    /** "added", "modified", "deleted" or "renamed". */
    val status: String,
    /** Line counts; both null for a binary file. */
    val added: Int?,
    val removed: Int?
) {
    val id: String get() = oldPath.orEmpty() + "\n" + path
    val isBinary: Boolean get() = added == null

    /** `NSString.lastPathComponent`. */
    val name: String get() = path.trimEnd('/').substringAfterLast('/').ifEmpty { path }

    /** `NSString.deletingLastPathComponent`. */
    val directory: String
        get() = path.trimEnd('/').substringBeforeLast('/', missingDelimiterValue = "")

    companion object {
        fun parse(o: JsonObject): CommitFile = CommitFile(
            path = o.string("path").orEmpty(),
            oldPath = o.string("oldPath")?.ifEmpty { null },
            status = o.string("status") ?: "modified",
            added = o.int("added"),
            removed = o.int("removed")
        )
    }
}

/** The lines every file adds and removes; a binary file counts none. */
val List<CommitFile>.lineTotals: Pair<Int, Int>
    get() = sumOf { it.added ?: 0 } to sumOf { it.removed ?: 0 }

/**
 * Where the pushed commits start: the row the "Pushed" line goes above. Null when
 * every listed commit is pushed or none is.
 */
val List<HistoryCommit>.remoteBoundary: Int?
    get() = indexOfFirst { !it.unpushed }.takeIf { it > 0 }

/** How long ago, as the desktop's History says it: "just now", "5m ago", "3d ago". */
fun relativeAgo(unix: Long, nowSeconds: Long): String {
    if (unix <= 0) return ""
    val s = maxOf(0, nowSeconds - unix)
    val short = when {
        s < 60 -> return "just now"
        s < 3_600 -> "${s / 60}m"
        s < 86_400 -> "${s / 3_600}h"
        s < 604_800 -> "${s / 86_400}d"
        s < 2_592_000 -> "${s / 604_800}w"
        s < 31_536_000 -> "${s / 2_592_000}mo"
        else -> "${s / 31_536_000}y"
    }
    return "$short ago"
}
