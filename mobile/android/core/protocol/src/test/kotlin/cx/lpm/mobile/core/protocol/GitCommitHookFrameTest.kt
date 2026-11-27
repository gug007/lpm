package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.CommitHookFailure
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** `gitCommit`'s `hookFailure` reply and `skipHooks` request (PROTOCOL.md). */
class GitCommitHookFrameTest {
    @Test
    fun aStoppedCommitCarriesTheHookBesideTheError() {
        val f = decode<Inbound.GitCommit>(
            """{ "t": "gitCommit", "project": "a", "ok": false,
                 "error": "pre-commit hook failed",
                 "hookFailure": { "hook": "pre-commit", "summary": "eslint · 3 errors in src/a.ts",
                   "output": "src/a.ts\n  3:1  error  no-unused-vars", "changed": ["src/b.ts"] } }"""
        )
        assertEquals("pre-commit hook failed", f.error)
        assertEquals(
            CommitHookFailure(
                hook = "pre-commit",
                summary = "eslint · 3 errors in src/a.ts",
                output = "src/a.ts\n  3:1  error  no-unused-vars",
                changed = listOf("src/b.ts")
            ),
            f.hook
        )
    }

    @Test
    fun anOlderMacOrAnEmptyHookSendsOnlyTheError() {
        val older = decode<Inbound.GitCommit>(
            """{ "t": "gitCommit", "project": "a", "ok": false, "error": "hook failed" }"""
        )
        assertEquals("hook failed", older.error)
        assertNull(older.hook)
        val nameless = decode<Inbound.GitCommit>(
            """{ "t": "gitCommit", "project": "a", "ok": false, "error": "x",
                 "hookFailure": { "hook": "", "output": "x" } }"""
        )
        assertNull(nameless.hook)
        val minimal = decode<Inbound.GitCommit>(
            """{ "t": "gitCommit", "project": "a", "ok": false,
                 "hookFailure": { "hook": "commit-msg", "summary": null } }"""
        )
        assertEquals("Couldn't commit.", minimal.error)
        assertEquals(CommitHookFailure("commit-msg", null, "", emptyList()), minimal.hook)
    }

    @Test
    fun aCommitThatLandedHasNoHook() {
        val f = decode<Inbound.GitCommit>(
            """{ "t": "gitCommit", "project": "a", "ok": true,
                 "hookFailure": { "hook": "pre-commit", "output": "" } }"""
        )
        assertNull(f.error)
        assertNull(f.hook)
    }

    @Test
    fun skipHooksGoesOnTheWireOnlyWhenAsked() {
        assertFrame(
            """{ "t": "gitCommit", "project": "a", "message": "Fix", "files": ["x.ts"] }""",
            Wire.gitCommit("a", "Fix", listOf("x.ts"), skipHooks = false)
        )
        assertFrame(
            """{ "t": "gitCommit", "project": "a", "message": "Fix", "files": ["x.ts"],
                 "skipHooks": true }""",
            Wire.gitCommit("a", "Fix", listOf("x.ts"), skipHooks = true)
        )
    }
}
