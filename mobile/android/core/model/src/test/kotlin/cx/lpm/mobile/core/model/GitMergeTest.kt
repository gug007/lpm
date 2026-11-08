package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GitMergeTest {
    private val clean = """{ "mergeable": "MERGEABLE", "state": "CLEAN", "review": "APPROVED",
        "head": "4b8e2f1", "methods": ["merge", "squash", "rebase"], "deletesBranch": false }"""

    private fun checks(
        merge: String? = clean,
        states: List<String> = listOf("pass", "skipped"),
        isDraft: Boolean = false
    ): GitChecks {
        val list = states.mapIndexed { i, state ->
            """{ "name": "check $i", "workflow": "CI", "state": "$state", "url": "" }"""
        }
        val mergeField = merge?.let { ", \"merge\": $it" }.orEmpty()
        val text = """{ "t": "gitChecks", "project": "a", "ok": true, "branch": "feat/x",
            "pr": { "number": 42, "url": "https://github.com/o/r/pull/42", "title": "Checkout",
                    "isDraft": $isDraft, "checks": [${list.joinToString()}]$mergeField },
            "commit": null }"""
        return GitChecks.parse(Json.parseToJsonElement(text) as JsonObject)!!
    }

    private fun offer(state: String, mergeable: String = "MERGEABLE", review: String = "") =
        """{ "mergeable": "$mergeable", "state": "$state", "review": "$review", "head": "a" }"""

    @Test
    fun `a pull request carries how GitHub stands on merging it`() {
        val pr = checks().pr!!
        assertFalse(pr.isDraft)
        val merge = pr.merge!!
        assertEquals("CLEAN", merge.state)
        assertEquals("4b8e2f1", merge.head)
        assertEquals(GitMergeMethod.entries, merge.methods)
        assertFalse(merge.deletesBranch)
        assertNull("an older Mac sends no merge", checks(merge = null).pr!!.merge)
    }

    @Test
    fun `methods keep GitHub's order and fall back to all three`() {
        val some = checks(merge = """{ "methods": ["squash", "fast-forward", "rebase"] }""")
        assertEquals(
            listOf(GitMergeMethod.SQUASH, GitMergeMethod.REBASE),
            some.pr!!.merge!!.methods
        )
        val none = checks(merge = """{ "methods": [] }""")
        assertEquals(GitMergeMethod.entries, none.pr!!.merge!!.methods)
        assertEquals("Squash and merge", GitMergeMethod.SQUASH.label)
    }

    @Test
    fun `ready says what passed`() {
        assertEquals(
            GitMergeStatus.Ready("All checks passed · Approved · No conflicts"),
            checks().mergeStatus
        )
        assertEquals(
            GitMergeStatus.Ready("No checks · No conflicts"),
            checks(merge = offer("UNSTABLE"), states = listOf("skipped")).mergeStatus
        )
        assertTrue(checks(merge = offer("HAS_HOOKS")).mergeStatus is GitMergeStatus.Ready)
    }

    @Test
    fun `failing checks come first, running ones wait`() {
        assertNull(checks(states = listOf("fail", "pending")).mergeStatus)
        assertEquals(
            GitMergeStatus.WaitingForChecks,
            checks(states = listOf("pending", "pass")).mergeStatus
        )
        assertNull("no pull request, no merge", checks(merge = null).mergeStatus)
    }

    @Test
    fun `what keeps it from merging`() {
        val draft = GitMergeStatus.Blocked(
            "Draft pull requests can't be merged. Mark it ready for review on GitHub."
        )
        assertEquals(draft, checks(isDraft = true, states = listOf("fail")).mergeStatus)
        assertEquals(draft, checks(merge = offer("DRAFT")).mergeStatus)
        assertEquals(
            GitMergeStatus.Blocked("This branch has conflicts with its base branch."),
            checks(merge = offer("BLOCKED", mergeable = "CONFLICTING")).mergeStatus
        )
        assertEquals(
            GitMergeStatus.Blocked("This branch has conflicts with its base branch."),
            checks(merge = offer("DIRTY")).mergeStatus
        )
        assertEquals(
            GitMergeStatus.Blocked(
                "This branch is behind its base branch. Update it before merging."
            ),
            checks(merge = offer("BEHIND")).mergeStatus
        )
        assertEquals(
            GitMergeStatus.Blocked("A reviewer asked for changes."),
            checks(merge = offer("BLOCKED", review = "CHANGES_REQUESTED")).mergeStatus
        )
        assertEquals(
            GitMergeStatus.Blocked("A review is required before merging."),
            checks(merge = offer("BLOCKED", review = "REVIEW_REQUIRED")).mergeStatus
        )
        assertEquals(
            GitMergeStatus.Blocked("The base branch's rules don't allow merging yet."),
            checks(merge = offer("BLOCKED")).mergeStatus
        )
    }

    @Test
    fun `an unknown state is still being worked out`() {
        assertEquals(GitMergeStatus.Checking, checks(merge = offer("UNKNOWN")).mergeStatus)
        assertEquals(GitMergeStatus.Checking, checks(merge = offer("")).mergeStatus)
    }
}
