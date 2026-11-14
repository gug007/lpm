package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.data.git.GitOpError
import cx.lpm.mobile.core.data.git.GitStore
import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.git.ReviewStores
import cx.lpm.mobile.feature.git.data.ReviewDraftsStore
import cx.lpm.mobile.feature.git.demoSession
import cx.lpm.mobile.feature.git.settle
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The commit sheet's draft and its two buttons, through the review's ViewModel. */
class CommitSheetViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

    private val demoMessage = "feat(checkout): redesign the checkout form and add a payments module"

    private fun TestScope.review(t: TestSession): GitReviewViewModel {
        val vm = GitReviewViewModel(
            GitReviewKey("storefront"),
            t.sessions,
            t.prefs,
            StandardTestDispatcher(testScheduler)
        )
        keepCollecting(vm.uiState)
        vm.appear()
        t.settle()
        return vm
    }

    /** A live Mac whose `storefront` has one change, `a.ts`. */
    private fun TestScope.live(): Pair<TestSession, FakeSocket> {
        val t = TestSession(this, ReviewStores)
        return t to t.connectReady()
    }

    private fun FakeSocket.reply(t: String, fields: String) =
        receive("""{"t":"$t","project":"storefront",$fields}""")

    private fun FakeSocket.oneChange(detached: Boolean = false) = reply(
        "git",
        """"ok":true,"isRepo":true,"branch":"main","detached":$detached,""" +
            """"files":[{"path":"a.ts","status":"modified"}]"""
    )

    @Test
    fun `opening the sheet with no message drafts one from the diff`() = runTest {
        val t = demoSession()
        val vm = review(t)
        vm.commitOpened()
        t.settle(0)
        assertTrue(vm.uiState.value.generating)
        t.settle(2_000)
        val drafted = vm.uiState.value
        assertEquals(demoMessage, drafted.message)
        assertTrue(drafted.drafted)
        assertFalse(drafted.generating)

        vm.setMessage("$demoMessage!")
        t.settle(0)
        assertFalse("an edited draft is no longer the Mac's", vm.uiState.value.drafted)
    }

    @Test
    fun `what the user types while it drafts wins`() = runTest {
        val t = demoSession()
        val vm = review(t)
        vm.commitOpened()
        t.settle(0)
        vm.setMessage("fix: mine")
        t.settle(2_000)
        val state = vm.uiState.value
        assertEquals("fix: mine", state.message)
        assertFalse(state.drafted)
        assertFalse(state.generating)
    }

    @Test
    fun `a message already there, or no files, opens without drafting`() = runTest {
        val t = demoSession()
        val vm = review(t)
        vm.setMessage("wip")
        vm.commitOpened()
        t.settle(0)
        assertFalse(vm.uiState.value.generating)

        vm.setMessage("")
        vm.selectAll(false)
        vm.commitOpened()
        t.settle(0)
        assertFalse(vm.uiState.value.generating)
    }

    @Test
    fun `a draft that failed isn't asked for again when the sheet reopens`() = runTest {
        val (t, socket) = live()
        val vm = review(t)
        socket.oneChange()
        t.settle(0)
        vm.commitOpened()
        assertEquals(1, socket.sentOf("gitGenMessage").size)
        socket.reply("gitGenMessage", """"ok":false,"error":"No AI CLI"""")
        t.settle(0)
        assertEquals(
            GitOpError("Couldn't write a message", "No AI CLI"),
            vm.uiState.value.opError
        )
        vm.dismissOpError()

        vm.commitOpened()
        assertEquals(1, socket.sentOf("gitGenMessage").size)
        vm.generateMessage()
        assertEquals("Generate message still asks", 2, socket.sentOf("gitGenMessage").size)
    }

    @Test
    fun `commit and push keeps the draft through the push, then clears it`() = runTest {
        val t = demoSession()
        val vm = review(t)
        assertEquals("feat/checkout-redesign", vm.uiState.value.branch)
        vm.setMessage("feat: ship it")
        vm.commitAndPush()
        t.settle(0)
        assertEquals(CommitBusy.Committing, vm.uiState.value.busy)
        assertFalse(vm.uiState.value.canCommit)

        t.settle(500)
        val pushing = vm.uiState.value
        assertEquals(CommitBusy.Pushing, pushing.busy)
        assertEquals("feat: ship it", pushing.message)
        assertEquals(0, pushing.commitTick)

        t.settle(1_500)
        val after = vm.uiState.value
        assertNull(after.busy)
        assertEquals("", after.message)
        assertEquals(1, after.commitTick)
        assertEquals("Committed and pushed", after.notice?.text)
        assertTrue(after.commitFiles.isEmpty())
    }

    @Test
    fun `commit only shows its own progress and never pushes`() = runTest {
        val (t, socket) = live()
        val vm = review(t)
        socket.oneChange()
        t.settle(0)
        vm.setMessage("fix: x")
        vm.commit()
        t.settle(0)
        assertEquals(CommitBusy.CommittingOnly, vm.uiState.value.busy)
        socket.reply("gitCommit", """"ok":true""")
        t.settle(0)
        assertTrue(socket.sentOf("gitPush").isEmpty())
        assertEquals("Committed successfully", vm.uiState.value.notice?.text)
        assertEquals(1, vm.uiState.value.commitTick)
    }

    @Test
    fun `a push that fails after the commit keeps the commit`() = runTest {
        val (t, socket) = live()
        val vm = review(t)
        socket.oneChange()
        t.settle(0)
        vm.setMessage("feat: x")
        vm.commitAndPush()
        socket.reply("gitCommit", """"ok":true""")
        t.settle(0)
        assertEquals(CommitBusy.Pushing, vm.uiState.value.busy)
        assertEquals(1, socket.sentOf("gitPush").size)

        socket.reply("gitPush", """"ok":false,"error":"rejected: fetch first"""")
        t.settle(0)
        val state = vm.uiState.value
        assertEquals(
            GitOpError("Committed, but not pushed", "rejected: fetch first"),
            state.opError
        )
        assertEquals(1, state.commitTick)
        assertEquals("", state.message)
        assertNull(state.busy)
    }

    @Test
    fun `a draft that lands after its commit doesn't fill the next message`() = runTest {
        val (t, socket) = live()
        val vm = review(t)
        socket.oneChange()
        t.settle(0)
        vm.commitOpened()
        vm.setMessage("fix: mine")
        vm.commit()
        socket.reply("gitCommit", """"ok":true""")
        t.settle(0)
        socket.reply("gitGenMessage", """"ok":true,"message":"feat: late"""")
        t.settle(0)
        assertEquals("", vm.uiState.value.message)
        assertFalse(vm.uiState.value.drafted)
    }

    @Test
    fun `a commit that lands after leaving Changes takes its draft with it`() = runTest {
        val (t, socket) = live()
        socket.oneChange()
        t.settle(0)
        val drafts = t.store<ReviewDraftsStore>()
        drafts.updateDraft("storefront") { it.copy(message = "fix: mine") }
        t.store<GitStore>().commit("storefront", "fix: mine", listOf("a.ts"))
        socket.reply("gitCommit", """"ok":true""")
        t.settle(0)
        assertNull(drafts.state.value.commitDrafts["storefront"])
    }

    @Test
    fun `a detached HEAD has no branch row`() = runTest {
        val (t, socket) = live()
        val vm = review(t)
        socket.oneChange(detached = true)
        t.settle(0)
        assertNull(vm.uiState.value.branch)
        socket.oneChange()
        t.settle(0)
        assertEquals("main", vm.uiState.value.branch)
    }
}
