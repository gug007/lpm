package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.CommitHookFailure
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** A commit a git hook stopped: its panel in place of the alert, and the ways on. */
@OptIn(ExperimentalCoroutinesApi::class)
class GitCommitHooksTest {
    private fun FakeSocket.reply(t: String, fields: String) =
        receive("""{"t":"$t","project":"storefront",$fields}""")

    private fun FakeSocket.stopped() = reply(
        "gitCommit",
        """"ok":false,"error":"pre-commit hook failed",""" +
            """"hookFailure":{"hook":"pre-commit","summary":"eslint · 1 error",""" +
            """"output":"a.ts\n  1:1  error  x","changed":["b.ts"]}"""
    )

    private fun TestScope.settle() = testScheduler.runCurrent()

    @Test
    fun `a hook that stops the commit gets its panel, not the alert, and never pushes`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.commitAndPush("storefront", "feat: x", listOf("a.ts", "b.ts"))
        assertEquals(
            PendingCommit("feat: x", listOf("a.ts", "b.ts"), push = true),
            git.state.value.stoppedCommits["storefront"]
        )
        socket.stopped()
        settle()
        val state = git.state.value
        assertEquals(
            CommitHookFailure(
                "pre-commit",
                "eslint · 1 error",
                "a.ts\n  1:1  error  x",
                listOf("b.ts")
            ),
            state.hookFailures["storefront"]
        )
        assertNull(state.opError["storefront"])
        assertTrue(state.committing.isEmpty())
        assertTrue(state.commitPushing.isEmpty())
        assertTrue(socket.sentOf("gitPush").isEmpty())
        assertNull(state.commitTick["storefront"])

        settleAlive(socket, 120_000)
        assertNull("its timeout went with it", git.state.value.opError["storefront"])
    }

    @Test
    fun `commit without hooks sends the stopped commit with skipHooks, then pushes`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.commitAndPush("storefront", "feat: x", listOf("a.ts", "b.ts"))
        socket.stopped()
        settle()

        git.commitWithoutHooks("storefront")
        val sent = socket.sentOf("gitCommit")
        assertEquals(2, sent.size)
        assertNull(sent[0]["skipHooks"])
        assertEquals(true, sent[1]["skipHooks"]?.jsonPrimitive?.boolean)
        assertEquals(sent[0]["files"], sent[1]["files"])
        assertEquals(sent[0]["message"], sent[1]["message"])
        assertNull("a new commit clears the panel", git.state.value.hookFailures["storefront"])
        assertTrue("storefront" in git.state.value.commitPushing)

        socket.reply("gitCommit", """"ok":true""")
        settle()
        assertEquals(1, socket.sentOf("gitPush").size)
    }

    @Test
    fun `commit without hooks after commit only doesn't push`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.commit("storefront", "fix: y", listOf("a.ts"))
        socket.stopped()
        settle()
        git.commitWithoutHooks("storefront")
        socket.reply("gitCommit", """"ok":true""")
        settle()
        assertTrue(socket.sentOf("gitPush").isEmpty())
        assertEquals("Committed successfully", git.state.value.notice["storefront"]?.text)
    }

    @Test
    fun `an older Mac's failure is still the alert, and dismissing the panel keeps the commit`() =
        runTest {
            val h = SessionHarness(this)
            val socket = h.connectReady()
            val git = h.session.store<GitStore>()
            git.commit("storefront", "fix: y", listOf("a.ts"))
            socket.reply("gitCommit", """"ok":false,"error":"hook failed"""")
            settle()
            assertEquals(
                GitOpError("Commit failed", "hook failed"),
                git.state.value.opError["storefront"]
            )
            assertTrue(git.state.value.hookFailures.isEmpty())

            git.commit("storefront", "fix: y", listOf("a.ts"))
            socket.stopped()
            settle()
            git.dismissHookFailure("storefront")
            assertTrue(git.state.value.hookFailures.isEmpty())
            assertEquals(
                PendingCommit("fix: y", listOf("a.ts"), push = false),
                git.state.value.stoppedCommits["storefront"]
            )
        }
}
