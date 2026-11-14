package cx.lpm.mobile.feature.git.data

import java.time.Instant

/**
 * A commit being written: its message, the files left out of it, and the message the
 * Mac last drafted.
 */
data class CommitDraft(
    val message: String = "",
    // Files the user unchecked: everything else stays selected, so new changes are
    // picked up and deselections survive a refresh.
    val deselected: Set<String> = emptySet(),
    val drafted: String? = null
) {
    val isEmpty: Boolean get() = message.isBlank() && deselected.isEmpty()
}

/** Review state that outlives the review screen, by project (iOS `GitReviewStore+Drafts`). */
data class ReviewDraftsState(
    val commitDrafts: Map<String, CommitDraft> = emptyMap(),
    /**
     * Files whose diff changed after they were marked viewed, and when: they lose Viewed
     * so a second pass isn't committed unseen. Project → path → time.
     */
    val changedSinceViewed: Map<String, Map<String, Instant>> = emptyMap()
) {
    fun draft(project: String): CommitDraft = commitDrafts[project] ?: CommitDraft()
}
