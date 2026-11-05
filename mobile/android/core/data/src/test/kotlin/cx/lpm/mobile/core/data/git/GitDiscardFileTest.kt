package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.strings
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GitDiscardFileTest {
    private fun FakeSocket.reply(t: String, fields: String) =
        receive("""{"t":"$t","project":"storefront",$fields}""")

    private fun TestScope.settle() = testScheduler.runCurrent()

    @Test
    fun `only a Mac with the feature discards one file`() = runTest {
        val old = SessionHarness(this)
        old.connectReady()
        assertFalse(old.session.store<GitStore>().canDiscardFiles)

        val h = SessionHarness(this)
        h.connectReady(features = listOf("gitDiscardFiles"))
        assertTrue(h.session.store<GitStore>().canDiscardFiles)
    }

    @Test
    fun `a file's discard names it on the notice, with Undo`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf("gitDiscardFiles"))
        val git = h.session.store<GitStore>()
        git.discardFile("storefront", "lib/payments.ts")
        git.discardFile("storefront", "lib/payments.ts")

        val sent = socket.sentOf("gitDiscardFiles").single()
        assertEquals(listOf("lib/payments.ts"), sent.strings("paths"))
        assertEquals(setOf("storefront"), git.state.value.discarding)

        socket.reply(
            "gitDiscardFiles",
            """"paths":["lib/payments.ts"],"ok":true,"undo":"discard-2""""
        )
        settle()
        assertEquals(emptySet<String>(), git.state.value.discarding)
        val notice = git.state.value.notice["storefront"]
        assertEquals("Discarded changes to payments.ts", notice?.text)
        assertEquals("discard-2", notice?.undo)
        assertEquals(1, socket.sentOf("git").size)
        settleAlive(socket, 9_000)
        assertEquals(notice, git.state.value.notice["storefront"])
        settleAlive(socket, 1_000)
        assertNull(git.state.value.notice["storefront"])
    }

    @Test
    fun `with no copy kept the notice has no Undo`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf("gitDiscardFiles"))
        val git = h.session.store<GitStore>()
        git.discardFile("storefront", "README.md")
        socket.reply("gitDiscardFiles", """"paths":["README.md"],"ok":true""")
        settle()
        assertEquals("Discarded changes to README.md", git.state.value.notice["storefront"]?.text)
        assertNull(git.state.value.notice["storefront"]?.undo)
        settleAlive(socket, 2_000)
        assertNull(git.state.value.notice["storefront"])
    }

    @Test
    fun `a failed or lost discard alerts without reloading`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady(features = listOf("gitDiscardFiles"))
        val git = h.session.store<GitStore>()
        git.discardFile("storefront", "README.md")
        socket.reply("gitDiscardFiles", """"paths":["README.md"],"ok":false,"error":"No copy"""")
        settle()
        assertEquals(
            GitOpError("Couldn't discard changes", "No copy"),
            git.state.value.opError["storefront"]
        )
        assertTrue(socket.sentOf("git").isEmpty())

        git.dismissOpError("storefront")
        git.discardFile("storefront", "README.md")
        settleAlive(socket, 60_000)
        assertEquals(
            GitOpError("Couldn't discard changes", "Discarding changes timed out. Try again."),
            git.state.value.opError["storefront"]
        )
        assertEquals(emptySet<String>(), git.state.value.discarding)
    }
}
