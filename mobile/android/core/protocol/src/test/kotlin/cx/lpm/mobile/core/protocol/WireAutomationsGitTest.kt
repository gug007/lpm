package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class WireAutomationsGitTest {
    @Test
    fun automationReads() {
        assertFrame("""{ "t": "jobs" }""", Wire.jobs())
        assertFrame(
            """{ "t": "jobHistory", "project": "a", "jobId": "j" }""",
            Wire.jobHistory("a", "j")
        )
        assertFrame(
            """{ "t": "jobLiveOutput", "project": "a", "jobId": "j" }""",
            Wire.jobLiveOutput("a", "j")
        )
        assertFrame(
            """{ "t": "jobConfig", "project": "a", "jobId": "j", "source": "global" }""",
            Wire.jobConfig("a", "j", "global")
        )
    }

    @Test
    fun automationRuns() {
        assertFrame("""{ "t": "runJob", "project": "a", "jobId": "j" }""", Wire.runJob("a", "j"))
        assertFrame("""{ "t": "stopJob", "project": "a", "jobId": "j" }""", Wire.stopJob("a", "j"))
        assertFrame(
            """{ "t": "setJobEnabled", "project": "a", "jobId": "j", "enabled": false }""",
            Wire.setJobEnabled("a", "j", enabled = false)
        )
        assertFrame(
            """{ "t": "markJobSeen", "project": "a", "jobId": "j" }""",
            Wire.markJobSeen("a", "j", at = null)
        )
        assertFrame(
            """{ "t": "markJobSeen", "project": "a", "jobId": "j", "at": 1760000000 }""",
            Wire.markJobSeen("a", "j", at = 1_760_000_000)
        )
        assertFrame("""{ "t": "markAllJobsSeen" }""", Wire.markAllJobsSeen())
        assertFrame(
            """{ "t": "sendJobFollowup", "project": "a", "jobId": "j", "at": 1760000000, "message": "Try again",
                 "agent": "claude", "model": "opus", "effort": "high" }""",
            Wire.sendJobFollowup("a", "j", 1_760_000_000, "Try again", "claude", "opus", "high")
        )
    }

    @Test
    fun automationEdits() {
        val job = buildJsonObject {
            put("label", "Nightly")
            put("prompt", "run tests")
        }
        assertFrame(
            """{ "t": "saveJob", "id": "nightly", "source": "project", "project": "a", "job": { "label": "Nightly", "prompt": "run tests" } }""",
            Wire.saveJob("nightly", "project", "a", job)
        )
        assertFrame(
            """{ "t": "deleteJob", "id": "nightly", "source": "global", "project": "", "deleteCopies": true }""",
            Wire.deleteJob("nightly", "global", "", deleteCopies = true)
        )
    }

    @Test
    fun gitReview() {
        assertFrame("""{ "t": "git", "project": "a" }""", Wire.git("a"))
        assertFrame(
            """{ "t": "gitDiff", "project": "a", "path": "x.ts" }""",
            Wire.gitDiff("a", "x.ts")
        )
        assertFrame(
            """{ "t": "gitDiffs", "project": "a", "paths": ["x.ts", "y.ts"] }""",
            Wire.gitDiffs("a", listOf("x.ts", "y.ts"))
        )
        assertFrame(
            """{ "t": "gitCommit", "project": "a", "message": "Fix", "files": ["x.ts"] }""",
            Wire.gitCommit("a", "Fix", listOf("x.ts"))
        )
        assertFrame("""{ "t": "gitPush", "project": "a" }""", Wire.gitPush("a"))
        assertFrame(
            """{ "t": "gitGenMessage", "project": "a", "files": [] }""",
            Wire.gitGenMessage("a", emptyList())
        )
        assertFrame("""{ "t": "gitGenPr", "project": "a" }""", Wire.gitGenPr("a"))
        assertFrame(
            """{ "t": "gitCreatePr", "project": "a", "title": "Fix", "body": "Body" }""",
            Wire.gitCreatePr("a", "Fix", "Body")
        )
        assertFrame("""{ "t": "gitPull", "project": "a" }""", Wire.gitPull("a"))
        assertFrame("""{ "t": "gitFetch", "project": "a" }""", Wire.gitFetch("a"))
        assertFrame("""{ "t": "gitAutoPullUndo", "project": "a" }""", Wire.gitAutoPullUndo("a"))
        assertFrame("""{ "t": "gitDiscardAll", "project": "a" }""", Wire.gitDiscardAll("a"))
        assertFrame("""{ "t": "gitWatch", "project": "a" }""", Wire.gitWatch("a"))
        assertFrame("""{ "t": "gitUnwatch", "project": "a" }""", Wire.gitUnwatch("a"))
    }

    @Test
    fun gitHistory() {
        assertFrame(
            """{ "t": "gitHistory", "project": "a", "skip": 100, "limit": 100 }""",
            Wire.gitHistory("a", skip = 100, limit = 100)
        )
        assertFrame(
            """{ "t": "gitCommitFiles", "project": "a", "hash": "abc" }""",
            Wire.gitCommitFiles("a", "abc")
        )
        assertFrame(
            """{ "t": "gitCommitPatch", "project": "a", "hash": "abc", "path": "b.ts", "oldPath": "a.ts" }""",
            Wire.gitCommitPatch("a", "abc", "b.ts", "a.ts")
        )
        assertFrame(
            """{ "t": "gitCommitPatch", "project": "a", "hash": "abc", "path": "b.ts" }""",
            Wire.gitCommitPatch("a", "abc", "b.ts", "")
        )
    }

    @Test
    fun gitBranchesAndAutoRuns() {
        assertFrame("""{ "t": "gitBranches", "project": "a" }""", Wire.gitBranches("a"))
        assertFrame(
            """{ "t": "gitCheckout", "project": "a", "branch": "feat", "remote": "origin" }""",
            Wire.gitCheckout("a", "feat", "origin")
        )
        assertFrame(
            """{ "t": "gitCreateBranch", "project": "a", "name": "feat" }""",
            Wire.gitCreateBranch("a", "feat")
        )
        assertFrame(
            """{ "t": "gitAuto", "project": "a", "kind": "commitPush", "nonce": "N-1" }""",
            Wire.gitAuto("a", "commitPush", "N-1")
        )
        assertFrame("""{ "t": "gitAutoState", "project": "a" }""", Wire.gitAutoState("a"))
        assertFrame("""{ "t": "gitAutoCancel", "project": "a" }""", Wire.gitAutoCancel("a"))
        assertFrame(
            """{ "t": "gitAutoSwitchBase", "project": "a", "base": "main" }""",
            Wire.gitAutoSwitchBase("a", "main")
        )
    }
}
