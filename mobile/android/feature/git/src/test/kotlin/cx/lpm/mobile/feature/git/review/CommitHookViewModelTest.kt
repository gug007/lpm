package cx.lpm.mobile.feature.git.review

import cx.lpm.mobile.core.navigation.GitReviewKey
import cx.lpm.mobile.core.testing.FakeSocket
import cx.lpm.mobile.core.testing.MainDispatcherRule
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.core.testing.keepCollecting
import cx.lpm.mobile.feature.git.ReviewStores
import cx.lpm.mobile.feature.git.settle
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** The commit sheet's hook panel, through the review's ViewModel. */
class CommitHookViewModelTest {
    @get:Rule
    val main = MainDispatcherRule()

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

    private fun FakeSocket.reply(t: String, fields: String) =
        receive("""{"t":"$t","project":"storefront",$fields}""")

    /** A live Mac whose `storefront` has `a.ts` and `b.ts` changed, a commit of both stopped. */
    private fun TestScope.stopped(
        push: Boolean
    ): Triple<TestSession, FakeSocket, GitReviewViewModel> {
        val t = TestSession(this, ReviewStores)
        val socket = t.connectReady()
        val vm = review(t)
        socket.reply(
            "git",
            """"ok":true,"isRepo":true,"branch":"main","detached":false,""" +
                """"files":[{"path":"a.ts","status":"modified"},{"path":"b.ts","status":"modified"}]"""
        )
        t.settle(0)
        vm.setMessage("feat: checkout")
        if (push) vm.commitAndPush() else vm.commit()
        socket.reply(
            "gitCommit",
            """"ok":false,"error":"pre-commit hook failed",""" +
                """"hookFailure":{"hook":"pre-commit","summary":null,""" +
                """"output":"a.ts:3:1 error","changed":["b.ts"]}"""
        )
        t.settle(0)
        return Triple(t, socket, vm)
    }

    @Test
    fun `a stopped commit shows the panel, not the alert`() = runTest {
        val (_, socket, vm) = stopped(push = true)
        val state = vm.uiState.value
        assertEquals("pre-commit", state.hook?.hook)
        assertEquals(listOf("b.ts"), state.hook?.changed)
        assertNull(state.opError)
        assertNull(state.busy)
        assertTrue(socket.sentOf("gitPush").isEmpty())
    }

    @Test
    fun `try again sends the stopped commit as it was asked for`() = runTest {
        val (t, socket, vm) = stopped(push = false)
        vm.setMessage("something else")
        vm.toggleSelected("a.ts")
        vm.hook.retry()
        t.settle(0)
        assertNull("the panel goes as it commits", vm.uiState.value.hook)
        val again = socket.sentOf("gitCommit").last()
        assertEquals("feat: checkout", again.getValue("message").jsonPrimitive.content)
        assertEquals(socket.sentOf("gitCommit").first()["files"], again["files"])
        assertNull(again["skipHooks"])
    }

    @Test
    fun `commit without hooks pushes after when the stopped commit would have`() = runTest {
        val (t, socket, vm) = stopped(push = true)
        vm.hook.commitWithoutHooks()
        t.settle(0)
        val again = socket.sentOf("gitCommit").last()
        assertEquals(true, again["skipHooks"]?.jsonPrimitive?.boolean)
        assertEquals(CommitBusy.Committing, vm.uiState.value.busy)
        socket.reply("gitCommit", """"ok":true""")
        t.settle(0)
        assertEquals(1, socket.sentOf("gitPush").size)
    }

    @Test
    fun `the fix prompt names the stopped commit, and dismissing keeps the draft`() = runTest {
        val (t, _, vm) = stopped(push = false)
        vm.setMessage("edited since")
        val prompt = vm.hook.prompt().orEmpty()
        assertTrue(prompt.startsWith("I tried to commit with the message \"feat: checkout\""))
        assertTrue(prompt.endsWith("Files in the commit:\n- a.ts\n- b.ts"))

        vm.hook.dismiss()
        t.settle(0)
        assertNull(vm.uiState.value.hook)
        assertNull(vm.hook.prompt())
        assertEquals("edited since", vm.uiState.value.message)
    }
}
