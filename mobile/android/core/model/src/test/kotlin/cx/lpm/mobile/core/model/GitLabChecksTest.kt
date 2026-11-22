package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GitLabChecksTest {
    private fun checks(prUrl: String, isDraft: Boolean = false): GitChecks {
        val text = """{ "t": "gitChecks", "project": "a", "ok": true, "branch": "feat/x",
            "pr": { "number": 7, "url": "$prUrl", "title": "Checkout", "isDraft": $isDraft,
                    "checks": [{ "name": "test", "workflow": "CI", "state": "fail",
                                 "url": "https://gitlab.com/o/r/-/jobs/9131" }],
                    "merge": { "mergeable": "MERGEABLE", "state": "CLEAN", "review": "", "head": "a" } },
            "commit": null }"""
        return GitChecks.parse(Json.parseToJsonElement(text) as JsonObject)!!
    }

    @Test
    fun `a GitLab merge request goes by !N and links its pipelines`() {
        val gitlab = checks("https://gitlab.com/o/r/-/merge_requests/7")
        val pr = gitlab.pr!!
        assertTrue(pr.isGitLab)
        assertEquals("!7", pr.ref)
        assertEquals("GitLab", pr.site)
        assertEquals("Checks on !7", gitlab.heading)
        assertEquals("https://gitlab.com/o/r/-/merge_requests/7/pipelines", gitlab.githubUrl)
        assertEquals(listOf("9131"), gitlab.failingRunIds)
        assertEquals(
            GitMergeStatus.Blocked(
                "Draft merge requests can't be merged. Mark it ready for review on GitLab."
            ),
            checks("https://gitlab.com/o/r/-/merge_requests/7", isDraft = true).mergeStatus
        )
    }

    @Test
    fun `a GitHub pull request reads as before`() {
        val github = checks("https://github.com/o/r/pull/7")
        val pr = github.pr!!
        assertFalse(pr.isGitLab)
        assertEquals("#7", pr.ref)
        assertEquals("Checks on #7", github.heading)
        assertEquals("https://github.com/o/r/pull/7/checks", github.githubUrl)
        assertEquals("!7", MergedPullRequest(7, "", deletedBranch = true, isGitLab = true).ref)
    }
}
