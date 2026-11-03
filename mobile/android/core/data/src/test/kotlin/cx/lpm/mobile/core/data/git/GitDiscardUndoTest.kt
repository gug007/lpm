package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GitDiscardUndoTest {
    private fun FakeSocket.reply(t: String, fields: String) =
        receive("""{"t":"$t","project":"storefront",$fields}""")

    private fun TestScope.settle() = testScheduler.runCurrent()

    @Test
    fun `a kept copy shows Undo on the notice for ten seconds`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.discardAll("storefront")
        socket.reply("gitDiscardAll", """"ok":true,"undo":"1792089000"""")
        settle()

        val notice = git.state.value.notice["storefront"]
        assertEquals("Discarded all changes", notice?.text)
        assertEquals("1792089000", notice?.undo)
        assertEquals(1, socket.sentOf("git").size)
        settleAlive(socket, 9_000)
        assertEquals(notice, git.state.value.notice["storefront"])
        settleAlive(socket, 1_000)
        assertNull(git.state.value.notice["storefront"])
    }

    @Test
    fun `no copy, no Undo`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.discardAll("storefront")
        socket.reply("gitDiscardAll", """"ok":true,"undo":null""")
        settle()
        assertNull(git.state.value.notice["storefront"])
    }

    @Test
    fun `undo restores the copy, then says so and reloads`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.discardAll("storefront")
        socket.reply("gitDiscardAll", """"ok":true,"undo":"7"""")
        socket.reply("git", """"ok":true,"isRepo":true,"files":[]""")
        settle()

        git.restoreDiscarded("storefront", "7")
        git.restoreDiscarded("storefront", "7")
        val sent = socket.sentOf("gitRestoreDiscarded").single()
        assertEquals("7", sent.getValue("id").jsonPrimitive.content)
        assertNull("the Undo notice goes away", git.state.value.notice["storefront"])
        assertEquals(setOf("storefront"), git.state.value.restoringDiscard)

        socket.reply("gitRestoreDiscarded", """"ok":true""")
        settle()
        assertEquals(emptySet<String>(), git.state.value.restoringDiscard)
        assertEquals("Restored the discarded changes", git.state.value.notice["storefront"]?.text)
        assertNull(git.state.value.notice["storefront"]?.undo)
        assertEquals(2, socket.sentOf("git").size)
    }

    @Test
    fun `a failed or lost restore alerts and still reloads`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.restoreDiscarded("storefront", "7")
        socket.reply("gitRestoreDiscarded", """"ok":false,"error":"README.md has conflicts"""")
        settle()
        assertEquals(
            GitOpError("Couldn't restore the changes", "README.md has conflicts"),
            git.state.value.opError["storefront"]
        )
        assertEquals(1, socket.sentOf("git").size)

        git.dismissOpError("storefront")
        git.restoreDiscarded("storefront", "8")
        settleAlive(socket, 60_000)
        assertEquals(
            "Restoring the changes timed out. Check your Mac and try again.",
            git.state.value.opError["storefront"]?.message
        )
        assertEquals(2, socket.sentOf("git").size)
    }
}
