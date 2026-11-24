package cx.lpm.mobile.core.model

import kotlinx.serialization.json.JsonObject

/** An open issue of a project's repository (`gitIssues`), as the composer's @ menu offers it. */
data class RepoIssue(val number: Int, val title: String, val labels: List<String>) {
    /** By number, with or without the #, or by part of the title, as the desktop's menu searches. */
    fun matches(fragment: String): Boolean = "#$number $title".contains(fragment, ignoreCase = true)

    companion object {
        fun parse(o: JsonObject): RepoIssue? {
            val number = o.int("number") ?: return null
            return RepoIssue(
                number = number,
                title = o.string("title").orEmpty(),
                labels = o.strings("labels").orEmpty()
            )
        }
    }
}

private const val NEWEST_ISSUES = 5
private const val MATCHING_ISSUES = 20

/** What the @ menu shows: the newest few for an empty fragment, else the matches. */
fun List<RepoIssue>.matching(fragment: String): List<RepoIssue> = if (fragment.isEmpty()) {
    take(NEWEST_ISSUES)
} else {
    filter { it.matches(fragment) }.take(MATCHING_ISSUES)
}
