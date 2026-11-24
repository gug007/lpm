package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GitOpsTest {
    /** A reply about `storefront`: [t] with [fields]. */
    private fun FakeSocket.reply(t: String, fields: String) =
        receive("""{"t":"$t","project":"storefront",$fields}""")

    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    @Test
    fun `a commit sends the selected files, then announces, ticks and reloads`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.commit("storefront", "fix: things", listOf("a.ts", "b.ts"))
        git.commit("storefront", "again", listOf("a.ts"))
        val sent = socket.sentOf("gitCommit").single()
        assertEquals("fix: things", sent.getValue("message").jsonPrimitive.content)
        assertEquals(
            listOf("a.ts", "b.ts"),
            sent.getValue("files").jsonArray.map {
                it.jsonPrimitive.content
            }
        )
        assertTrue("storefront" in git.state.value.committing)

        socket.reply("gitCommit", """"ok":true""")
        settle()
        val state = git.state.value
        assertTrue(state.committing.isEmpty())
        assertEquals(1, state.commitTick["storefront"])
        assertEquals("Committed successfully", state.notice["storefront"]?.text)
        assertEquals(1, socket.sentOf("git").size)
    }

    @Test
    fun `a failed or silent commit says why`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.commit("storefront", "m", listOf("a.ts"))
        socket.reply("gitCommit", """"ok":false,"error":"hook failed"""")
        settle()
        assertEquals(
            GitOpError("Commit failed", "hook failed"),
            git.state.value.opError["storefront"]
        )
        assertNull(git.state.value.commitTick["storefront"])

        git.commit("storefront", "m", listOf("a.ts"))
        assertNull("a new attempt clears the old error", git.state.value.opError["storefront"])
        settleAlive(socket, 120_000)
        assertEquals(
            GitOpError("Commit failed", "Commit timed out. Check your Mac and try again."),
            git.state.value.opError["storefront"]
        )
    }

    @Test
    fun `a generated message waits to be taken, a failure alerts`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.genMessage("storefront", listOf("a.ts"))
        assertTrue("storefront" in git.state.value.generatingMessage)
        socket.reply("gitGenMessage", """"ok":true,"message":"feat: x"""")
        settle()
        assertEquals("feat: x", git.state.value.generatedMessage["storefront"])
        assertTrue(git.state.value.generatingMessage.isEmpty())
        git.consumeGeneratedMessage("storefront")
        assertNull(git.state.value.generatedMessage["storefront"])

        git.genMessage("storefront", listOf("a.ts"))
        socket.reply("gitGenMessage", """"ok":false,"error":"No AI CLI"""")
        settle()
        assertEquals(
            GitOpError("Couldn't write a message", "No AI CLI"),
            git.state.value.opError["storefront"]
        )

        git.genMessage("storefront", listOf("a.ts"))
        settleAlive(socket, 120_000)
        assertEquals(
            "Message generation timed out. Try again.",
            git.state.value.opError["storefront"]?.message
        )
    }

    @Test
    fun `a pull request draft and creation, with errors kept for the sheet`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.genPr("storefront")
        socket.reply("gitGenPr", """"ok":true,"title":"T","body":"B"""")
        settle()
        assertEquals(GitPrDraft("T", "B"), git.state.value.prDraft["storefront"])
        git.consumePrDraft("storefront")

        git.createPr("storefront", "T", "B", closeIssue = null)
        assertTrue("storefront" in git.state.value.creatingPr)
        socket.reply("gitCreatePr", """"ok":true,"url":"https://x/1"""")
        settle()
        assertEquals("https://x/1", git.state.value.createdPrUrl["storefront"])
        assertEquals("a created pull request refreshes the snapshot", 1, socket.sentOf("git").size)
        git.consumeCreatedPrUrl("storefront")

        git.createPr("storefront", "T", "B", closeIssue = null)
        socket.reply("gitCreatePr", """"ok":false,"error":"gh: not logged in"""")
        settle()
        assertEquals("gh: not logged in", git.state.value.prError["storefront"])
        assertNull(
            "sheet errors stay out of the screen's alert",
            git.state.value.opError["storefront"]
        )
        git.dismissPrError("storefront")

        git.genPr("storefront")
        settleAlive(socket, 120_000)
        assertEquals(
            "Draft generation timed out. Try again.",
            git.state.value.prError["storefront"]
        )
        git.createPr("storefront", "T", "B", closeIssue = null)
        settleAlive(socket, 120_000)
        assertEquals(
            "Pull request creation timed out. Try again.",
            git.state.value.prError["storefront"]
        )
    }

    @Test
    fun `branches load, check out and refresh the project list`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        val projectsBefore = socket.sentOf("projects").size
        val sidebarBefore = socket.sentOf("sidebar").size
        git.loadBranches("storefront")
        socket.reply(
            "gitBranches",
            """"ok":true,"current":"main","branches":[""" +
                """{"name":"main","committerDate":"1700000000"},""" +
                """{"name":"dev","committerDate":"1700000000","remote":"origin"}]"""
        )
        settle()
        assertEquals("main", git.state.value.currentBranch["storefront"])
        val ids = git.state.value.branches["storefront"]?.map { it.id }
        assertEquals(listOf("main", "origin/dev"), ids)

        git.checkout("storefront", "dev", "origin")
        git.checkout("storefront", "main", "")
        assertEquals("dev", git.state.value.checkingOut["storefront"])
        assertEquals(1, socket.sentOf("gitCheckout").size)
        socket.reply("gitCheckout", """"ok":true""")
        settle()
        assertNull(git.state.value.checkingOut["storefront"])
        assertEquals(1, git.state.value.checkoutTick["storefront"])
        assertNull("the list is stale after a switch", git.state.value.branches["storefront"])
        assertNull(git.state.value.currentBranch["storefront"])
        assertEquals(1, socket.sentOf("git").size)
        assertEquals("the list loads afresh", 2, socket.sentOf("gitBranches").size)
        assertEquals(projectsBefore + 1, socket.sentOf("projects").size)
        assertEquals(sidebarBefore + 1, socket.sentOf("sidebar").size)
    }

    @Test
    fun `branch failures stay in the sheet`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.loadBranches("storefront")
        settleAlive(socket, 30_000)
        assertEquals(
            "Couldn't load branches. Try again.",
            git.state.value.branchError["storefront"]
        )

        git.checkout("storefront", "dev", "")
        socket.reply("gitCheckout", """"ok":false,"error":"dirty tree"""")
        settle()
        assertEquals("dirty tree", git.state.value.branchError["storefront"])

        git.checkout("storefront", "dev", "")
        settleAlive(socket, 60_000)
        assertEquals(
            "Switching branch timed out. Try again.",
            git.state.value.branchError["storefront"]
        )
        assertNull(git.state.value.opError["storefront"])
        git.dismissBranchError("storefront")
        assertNull(git.state.value.branchError["storefront"])
    }

    @Test
    fun `a new branch is trimmed, checked out, and blank names go nowhere`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.createBranch("storefront", "   ")
        assertTrue(socket.sentOf("gitCreateBranch").isEmpty())

        git.createBranch("storefront", "  feat/x \n")
        assertEquals(
            "feat/x",
            socket.sentOf("gitCreateBranch").single().getValue("name").jsonPrimitive.content
        )
        assertTrue("storefront" in git.state.value.creatingBranch)
        socket.reply("gitCreateBranch", """"ok":true""")
        settle()
        assertTrue(git.state.value.creatingBranch.isEmpty())
        assertEquals(1, git.state.value.checkoutTick["storefront"])

        git.createBranch("storefront", "feat/x")
        socket.reply("gitCreateBranch", """"ok":false,"error":"already exists"""")
        settle()
        assertEquals("already exists", git.state.value.branchError["storefront"])
        git.createBranch("storefront", "feat/y")
        settleAlive(socket, 30_000)
        assertEquals(
            "Creating the branch timed out. Try again.",
            git.state.value.branchError["storefront"]
        )
    }

    @Test
    fun `discard and undo auto pull reload or alert`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val git = h.session.store<GitStore>()
        git.discardAll("storefront")
        socket.reply("gitDiscardAll", """"ok":true""")
        settle()
        assertEquals(1, socket.sentOf("git").size)
        assertNull("no notice for a discard", git.state.value.notice["storefront"])

        git.undoAutoPull("storefront")
        settleAlive(socket, 60_000)
        assertEquals("Couldn't undo the auto pull", git.state.value.opError["storefront"]?.title)
    }
}
