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
        isDraft: Boolean = false,
        mergeWatch: String? = null
    ): GitChecks {
        val list = states.mapIndexed { i, state ->
            """{ "name": "check $i", "workflow": "CI", "state": "$state", "url": "" }"""
        }
        val mergeField = merge?.let { ", \"merge\": $it" }.orEmpty()
        val watchField = mergeWatch?.let { "\"mergeWatch\": $it," }.orEmpty()
        val text = """{ "t": "gitChecks", "project": "a", "ok": true, "branch": "feat/x", $watchField
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

    @Test
    fun `the rules can be bypassed only while they hold it back`() {
        val blocked = checks(
            merge = """{ "state": "BLOCKED", "canBypass": true, "base": "main" }"""
        ).pr!!.merge!!
        assertTrue(blocked.canBypass)
        assertEquals("main", blocked.baseName)
        assertTrue(blocked.bypassable)
        assertTrue(
            checks(merge = """{ "state": "BEHIND", "canBypass": true }""").pr!!.merge!!.bypassable
        )
        assertFalse(
            checks(merge = """{ "state": "CLEAN", "canBypass": true }""").pr!!.merge!!.bypassable
        )
        assertFalse(checks(merge = """{ "state": "BLOCKED" }""").pr!!.merge!!.bypassable)
        val older = checks().pr!!.merge!!
        assertFalse(older.canBypass)
        assertEquals("its base branch", older.baseName)
    }

    @Test
    fun `a wait to merge parses and says what it will do`() {
        val watch = GitMergeWatch.parse(
            Json.parseToJsonElement(
                """{ "path": "/p", "number": 42, "title": "Checkout", "method": "rebase",
                     "deleteBranch": true, "bypass": true, "state": "stopped", "reason": "",
                     "deletedBranch": true }"""
            ) as JsonObject
        )!!
        assertEquals(42, watch.number)
        assertEquals(GitMergeMethod.REBASE, watch.method)
        assertEquals("stopped", watch.state)
        assertNull("an empty reason is none", watch.reason)
        assertTrue(watch.deletedBranch)
        assertFalse(watch.waiting)
        assertEquals(
            "Rebase and merge once the running checks pass, bypassing the rules on main if " +
                "they still block it, then delete the branch on GitHub. Stops if a check fails.",
            watch.armedText("main", "GitHub")
        )
        val plain =
            GitMergeWatch(7, "T", GitMergeMethod.SQUASH, deleteBranch = false, bypass = false)
        assertTrue(plain.waiting)
        assertEquals(
            "Squash and merge once the running checks pass. Stops if a check fails.",
            plain.armedText("main", "GitHub")
        )
        assertNull(GitMergeWatch.parse(null))
        assertNull(
            GitMergeWatch.parse(Json.parseToJsonElement("""{ "title": "x" }""") as JsonObject)
        )
        val unknown = GitMergeWatch.parse(
            Json.parseToJsonElement("""{ "number": 1 }""") as JsonObject
        )!!
        assertEquals(GitMergeMethod.SQUASH, unknown.method)
    }

    @Test
    fun `only a waiting watch rides on the checks`() {
        val armed = """{ "number": 42, "title": "Checkout", "method": "merge",
            "deleteBranch": false, "bypass": false, "state": "waiting" }"""
        assertEquals(42, checks(mergeWatch = armed).mergeWatch?.number)
        assertNull(checks(mergeWatch = armed.replace("waiting", "merged")).mergeWatch)
        assertNull(checks().mergeWatch)
    }

    @Test
    fun `wait text counts the running checks`() {
        val one =
            checks(
                merge = """{ "state": "BLOCKED", "base": "main" }""",
                states = listOf("pending", "pass")
            )
        assertEquals(1, one.runningChecks)
        assertEquals("lpm merges once the running check passes.", one.waitText(bypass = false))
        val three = checks(states = listOf("pending", "pending", "pending", "skipped"))
        assertEquals("lpm merges once the 3 running checks pass.", three.waitText(bypass = false))
        assertEquals(
            "lpm merges once the running check passes, bypassing the rules on main if they " +
                "still block it.",
            one.waitText(bypass = true)
        )
        assertEquals(
            "lpm merges once the 3 running checks pass, bypassing the rules on its base branch " +
                "if they still block it.",
            three.waitText(bypass = true)
        )
    }
}
