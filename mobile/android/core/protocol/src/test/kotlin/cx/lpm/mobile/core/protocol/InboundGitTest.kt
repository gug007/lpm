package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.GitAutoKind
import cx.lpm.mobile.core.model.GitAutoRun
import cx.lpm.mobile.core.model.GitAutoStep
import cx.lpm.mobile.core.model.GitBranch
import cx.lpm.mobile.core.model.GitDiffResult
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class InboundGitTest {
    @Test
    fun gitSnapshot() {
        val f = decode<Inbound.Git>(
            """{ "t": "git", "project": "storefront", "ok": true, "isRepo": true, "branch": "main", "detached": false,
                 "hasUpstream": true, "ahead": 2, "behind": 1, "defaultBranch": "main", "ghCli": true,
                 "files": [{ "path": "src/app.ts", "status": "modified", "staged": false, "stamp": "abc" },
                           { "path": "new.txt", "status": "untracked" }],
                 "autoPulled": { "count": 3, "branch": "main", "from": "a1", "to": "b2", "at": 1760000000000 } }"""
        )
        val snap = f.snapshot!!
        assertEquals(2, snap.ahead)
        assertEquals(listOf("src/app.ts", "new.txt"), snap.files.map { it.id })
        assertEquals("3 commits on main", snap.autoPulled!!.summary)
        assertNull(snap.aheadOfDefault)
        assertNull(f.error)
        val worktree = decode<Inbound.Git>(
            """{ "t": "git", "project": "storefront-2", "ok": true, "isRepo": true, "branch": "feat/x",
                 "hasUpstream": false, "defaultBranch": "main", "aheadOfDefault": 3 }"""
        )
        assertEquals(3, worktree.snapshot!!.aheadOfDefault)
        val notRepo =
            decode<Inbound.Git>(
                """{ "t": "git", "project": "notes", "ok": true, "isRepo": false }"""
            )
        assertFalse(notRepo.snapshot!!.isRepo)
        assertEquals(
            Inbound.Git("x", null, "Couldn't read the repository."),
            Inbound.parse("""{ "t": "git", "project": "x", "isRepo": true }""")
        )
    }

    @Test
    fun gitDiff() {
        assertEquals(
            Inbound.GitDiff(
                "a",
                "src/app.ts",
                "@@ -1 +1 @@",
                binary = false,
                truncated = true,
                error = null
            ),
            Inbound.parse(
                """{ "t": "gitDiff", "project": "a", "path": "src/app.ts", "ok": true, "diff": "@@ -1 +1 @@",
                     "binary": false, "truncated": true }"""
            )
        )
        assertEquals(
            "Couldn't load the diff.",
            decode<Inbound.GitDiff>("""{ "t": "gitDiff", "project": "a" }""").error
        )
    }

    @Test
    fun gitDiffs() {
        val f = decode<Inbound.GitDiffs>(
            """{ "t": "gitDiffs", "project": "a", "ok": true, "files": [
                 { "path": "a.ts", "diff": "@@", "binary": false, "truncated": false },
                 { "path": "logo.png", "error": "binary file" }] }"""
        )
        assertEquals(GitDiffResult("@@", binary = false, truncated = false), f.entries[0].result)
        assertEquals("binary file", f.entries[1].error)
        assertNull(f.entries[1].result)
        val failed =
            decode<Inbound.GitDiffs>(
                """{ "t": "gitDiffs", "project": "a", "files": [{ "path": "a.ts" }] }"""
            )
        assertTrue(failed.entries.isEmpty())
        assertEquals("Couldn't load the diffs.", failed.error)
    }

    @Test
    fun simpleReplies() {
        val replies = mapOf(
            "gitCommit" to "Couldn't commit.",
            "gitPush" to "Couldn't push.",
            "gitPull" to "Couldn't pull.",
            "gitFetch" to "Couldn't fetch.",
            "gitAutoPullUndo" to "Couldn't undo the auto pull.",
            "gitCheckout" to "Couldn't switch branch.",
            "gitCreateBranch" to "Couldn't create the branch.",
            "gitDiscardAll" to "Couldn't discard changes.",
            "gitRestoreDiscarded" to "Couldn't restore the changes."
        )
        for ((t, fallback) in replies) {
            val ok = Inbound.parse("""{ "t": "$t", "project": "a", "ok": true }""")
            val failed = Inbound.parse("""{ "t": "$t", "project": "a", "ok": false }""")
            val custom = Inbound.parse(
                """{ "t": "$t", "project": "a", "ok": false, "error": "rejected" }"""
            )
            assertEquals(
                t,
                listOf(null, fallback, "rejected"),
                listOf(ok, failed, custom).map(::errorOf)
            )
        }
        assertEquals(
            Inbound.GitCommit("a", null),
            Inbound.parse("""{ "t": "gitCommit", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitPush("a", "Couldn't push."),
            Inbound.parse("""{ "t": "gitPush", "project": "a" }""")
        )
        assertEquals(
            Inbound.GitPull("a", null),
            Inbound.parse("""{ "t": "gitPull", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitFetch("a", null),
            Inbound.parse("""{ "t": "gitFetch", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitAutoPullUndo("a", null),
            Inbound.parse("""{ "t": "gitAutoPullUndo", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitCheckout("a", null),
            Inbound.parse("""{ "t": "gitCheckout", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitCreateBranch("a", null),
            Inbound.parse("""{ "t": "gitCreateBranch", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitDiscardAll("a", null),
            Inbound.parse("""{ "t": "gitDiscardAll", "project": "a", "ok": true }""")
        )
    }

    private fun errorOf(frame: Inbound?): String? = when (frame) {
        is Inbound.GitCommit -> frame.error
        is Inbound.GitPush -> frame.error
        is Inbound.GitPull -> frame.error
        is Inbound.GitFetch -> frame.error
        is Inbound.GitAutoPullUndo -> frame.error
        is Inbound.GitCheckout -> frame.error
        is Inbound.GitCreateBranch -> frame.error
        is Inbound.GitDiscardAll -> frame.error
        is Inbound.GitRestoreDiscarded -> frame.error
        else -> "unexpected $frame"
    }

    @Test
    fun discardNamesTheCopyItKept() {
        assertEquals(
            Inbound.GitDiscardAll("a", null, undo = "1792089000"),
            Inbound.parse(
                """{ "t": "gitDiscardAll", "project": "a", "ok": true, "undo": "1792089000" }"""
            )
        )
        for (undo in listOf("null", "\"\"")) {
            assertEquals(
                Inbound.GitDiscardAll("a", null),
                Inbound.parse(
                    """{ "t": "gitDiscardAll", "project": "a", "ok": true, "undo": $undo }"""
                )
            )
        }
        assertEquals(
            Inbound.GitRestoreDiscarded("a", null),
            Inbound.parse("""{ "t": "gitRestoreDiscarded", "project": "a", "ok": true }""")
        )
    }

    @Test
    fun aiDrafts() {
        assertEquals(
            Inbound.GitGenMessage("a", "Fix the login redirect", null),
            Inbound.parse(
                """{ "t": "gitGenMessage", "project": "a", "ok": true, "message": "Fix the login redirect" }"""
            )
        )
        assertEquals(
            Inbound.GitGenMessage("a", "", null),
            Inbound.parse("""{ "t": "gitGenMessage", "project": "a", "ok": true }""")
        )
        assertEquals(
            Inbound.GitGenMessage("a", null, "Couldn't generate a message."),
            Inbound.parse("""{ "t": "gitGenMessage", "project": "a", "message": "x" }""")
        )
        assertEquals(
            Inbound.GitGenPr("a", "Login fix", "Fixes #12", null),
            Inbound.parse(
                """{ "t": "gitGenPr", "project": "a", "ok": true, "title": "Login fix", "body": "Fixes #12" }"""
            )
        )
        assertEquals(
            Inbound.GitGenPr("a", null, null, "Couldn't draft the pull request."),
            Inbound.parse("""{ "t": "gitGenPr", "project": "a", "ok": false }""")
        )
        assertEquals(
            Inbound.GitCreatePr("a", "https://github.com/o/r/pull/12", null),
            Inbound.parse(
                """{ "t": "gitCreatePr", "project": "a", "ok": true, "url": "https://github.com/o/r/pull/12" }"""
            )
        )
        assertEquals(
            Inbound.GitCreatePr("a", null, "Couldn't create the pull request."),
            Inbound.parse("""{ "t": "gitCreatePr", "project": "a" }""")
        )
    }

    @Test
    fun gitBranches() {
        val f = decode<Inbound.GitBranches>(
            """{ "t": "gitBranches", "project": "a", "ok": true, "current": "main",
                 "branches": [{ "name": "main", "committerDate": "2 days ago" }, { "name": "feat", "remote": "origin" }] }"""
        )
        assertEquals("main", f.current)
        assertEquals(GitBranch("feat", "", "origin"), f.branches[1])
        val failed =
            decode<Inbound.GitBranches>(
                """{ "t": "gitBranches", "project": "a", "current": "main" }"""
            )
        assertEquals("main", failed.current)
        assertTrue(failed.branches.isEmpty())
        assertEquals("Couldn't list branches.", failed.error)
    }

    @Test
    fun gitChanged() {
        assertEquals(
            Inbound.GitChanged("a"),
            Inbound.parse("""{ "t": "git-changed", "project": "a" }""")
        )
    }

    @Test
    fun gitAuto() {
        val f = decode<Inbound.GitAuto>(
            """{ "t": "gitAuto", "project": "a", "ok": true, "run": { "runId": 3, "nonce": "N-1", "kind": "pr",
                 "phase": "running", "canceling": false, "rebased": false,
                 "steps": [{ "id": "branch", "status": "done", "detail": "feat/login" }, { "id": "commit", "status": "running" },
                           { "id": "push", "status": "pending" }, { "id": "pr", "status": "pending" }] } }"""
        )
        val run = f.run!!
        assertEquals(GitAutoKind.Pr, run.kind)
        assertEquals(GitAutoRun.Phase.Running, run.phase)
        assertEquals(GitAutoStep("branch", GitAutoStep.Status.Done, "feat/login"), run.steps[0])
        assertEquals(
            Inbound.GitAuto("a", null, null),
            Inbound.parse("""{ "t": "gitAuto", "project": "a", "ok": true, "run": null }""")
        )
        assertNull(
            decode<Inbound.GitAuto>(
                """{ "t": "gitAuto", "project": "a", "ok": true, "run": { "kind": "x", "phase": "done" } }"""
            ).run
        )
        assertEquals(
            Inbound.GitAuto("a", null, "Couldn't start."),
            Inbound.parse("""{ "t": "gitAuto", "project": "a", "ok": false }""")
        )
    }

    @Test
    fun gitAutoSwitchBase() {
        assertEquals(
            Inbound.GitAutoSwitchBase("a", "main", null, "Couldn't fast-forward"),
            Inbound.parse(
                """{ "t": "gitAutoSwitchBase", "project": "a", "ok": true, "base": "main", "pullError": "Couldn't fast-forward" }"""
            )
        )
        assertEquals(
            Inbound.GitAutoSwitchBase("a", "", "Couldn't switch branch.", null),
            Inbound.parse("""{ "t": "gitAutoSwitchBase", "project": "a", "ok": false }""")
        )
    }

    @Test
    fun gitHistory() {
        val f = decode<Inbound.GitHistory>(
            """{ "t": "gitHistory", "project": "a", "skip": 100, "ok": true, "hasMore": true,
                 "commits": [{ "hash": "a1f3c9e5b2", "subject": "Two-step checkout", "author": "Alex Kim",
                   "time": 1760000000, "parents": 2, "unpushed": true,
                   "body": "Split it.\n\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
                   "coAuthors": ["Claude Opus 5.5 <noreply@anthropic.com>"] }] }"""
        )
        assertEquals(100, f.skip)
        val page = f.page!!
        assertTrue(page.hasMore)
        val commit = page.commits.single()
        assertEquals("a1f3c9e", commit.short)
        assertEquals(1_760_000_000L, commit.time)
        assertTrue(commit.isMerge)
        assertEquals("claude", commit.agent)
        assertEquals(listOf("Claude Opus 5.5"), commit.coAuthorNames)
        assertEquals("Split it.", commit.message)
        assertEquals(
            "Two-step checkout\n\nSplit it.\n\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>",
            commit.fullMessage
        )
        assertEquals("Two-step checkout", commit.copy(body = "").fullMessage)
        assertEquals(
            Inbound.GitHistory("a", 0, null, "Couldn't load the history."),
            Inbound.parse("""{ "t": "gitHistory", "project": "a", "ok": false }""")
        )
    }

    @Test
    fun gitCommitFilesAndPatch() {
        val files = decode<Inbound.GitCommitFiles>(
            """{ "t": "gitCommitFiles", "project": "a", "hash": "abc", "ok": true, "files": [
                 { "path": "app/cart/page.tsx", "oldPath": "app/cart.tsx", "status": "renamed", "added": 3, "removed": 1 },
                 { "path": "icon.png", "oldPath": null, "status": "added", "added": null, "removed": null }] }"""
        ).files!!
        assertEquals("app/cart.tsx", files[0].oldPath)
        assertEquals("page.tsx", files[0].name)
        assertEquals("app/cart", files[0].directory)
        assertTrue(files[1].isBinary)
        assertEquals("", files[1].directory)
        assertEquals(
            Inbound.GitCommitFiles("a", "x", null, "x is not a commit"),
            Inbound.parse(
                """{ "t": "gitCommitFiles", "project": "a", "hash": "x", "ok": false, "error": "x is not a commit" }"""
            )
        )
        assertEquals(
            Inbound.GitCommitPatch("a", "abc", "b.ts", GitDiffResult("@@", false, true), null),
            Inbound.parse(
                """{ "t": "gitCommitPatch", "project": "a", "hash": "abc", "path": "b.ts", "ok": true, "diff": "@@", "truncated": true }"""
            )
        )
        assertEquals(
            "Couldn't load the diff.",
            decode<Inbound.GitCommitPatch>("""{ "t": "gitCommitPatch", "ok": false }""").error
        )
    }
}
