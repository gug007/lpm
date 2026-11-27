package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.GitMergeMethod
import cx.lpm.mobile.core.model.GitMergeWatch
import cx.lpm.mobile.core.model.Haptic
import cx.lpm.mobile.core.model.MergedPullRequest
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class GitMergeWhenReadyTest {
    private val running =
        """{"t":"gitChecks","project":"storefront","ok":true,"branch":"feat/x","commit":null,""" +
            """"pr":{"number":42,"url":"https://github.com/o/r/pull/42",""" +
            """"title":"Two-step checkout flow","isDraft":false,""" +
            """"checks":[{"name":"test","workflow":"CI","state":"pending","url":""}],""" +
            """"merge":{"mergeable":"MERGEABLE","state":"BLOCKED","review":"","head":"4b8e2f1",""" +
            """"methods":["merge","squash"],"deletesBranch":false,"canBypass":true,"base":"main"}}}"""

    private fun TestScope.connected(
        features: List<String> = listOf(
            LpmClient.GIT_CHECKS_FEATURE,
            LpmClient.GIT_MERGE_FEATURE,
            LpmClient.GIT_MERGE_WHEN_READY_FEATURE
        )
    ): Pair<GitChecksStore, FakeSocket> {
        val h = SessionHarness(this)
        val socket = h.connectReady(features)
        socket.receive(running)
        testScheduler.runCurrent()
        return h.session.store<GitChecksStore>() to socket
    }

    private fun GitChecksStore.watch() = state.value.results["storefront"]?.mergeWatch

    private fun watchFrame(state: String, extra: String = "") =
        """{"t":"gitMergeWatch","project":"storefront","watch":{"path":"/p","number":42,""" +
            """"title":"Two-step checkout flow","method":"squash","deleteBranch":true,""" +
            """"bypass":false,"state":"$state","deletedBranch":true$extra}}"""

    @Test
    fun `arming sends the choices and shows it armed before the Mac answers`() = runTest {
        val (store, socket) = connected()
        assertTrue(store.canMergeWhenReady)
        store.mergeWhenReady("storefront", GitMergeMethod.MERGE, deleteBranch = true, bypass = true)
        val sent = socket.sentOf("gitMergePrWhenReady").single()
        assertEquals(JsonPrimitive(42), sent["number"])
        assertEquals(JsonPrimitive("Two-step checkout flow"), sent["title"])
        assertEquals(JsonPrimitive("merge"), sent["method"])
        assertEquals(JsonPrimitive(true), sent["deleteBranch"])
        assertEquals(JsonPrimitive(true), sent["bypass"])
        assertTrue("storefront" in store.state.value.arming)
        assertEquals(
            GitMergeWatch(
                42,
                "Two-step checkout flow",
                GitMergeMethod.MERGE,
                deleteBranch = true,
                bypass = true
            ),
            store.watch()
        )

        store.mergeWhenReady("storefront", GitMergeMethod.MERGE, deleteBranch = true, bypass = true)
        assertEquals("one at a time", 1, socket.sentOf("gitMergePrWhenReady").size)

        socket.receive("""{"t":"gitMergePrWhenReady","project":"storefront","ok":true}""")
        testScheduler.runCurrent()
        assertFalse("storefront" in store.state.value.arming)
        assertTrue(store.watch()!!.waiting)
        assertEquals(Haptic.Success, store.state.value.mergeFeedback["storefront"]?.haptic)
    }

    @Test
    fun `a refused arm says why and disarms`() = runTest {
        val (store, socket) = connected()
        store.mergeWhenReady(
            "storefront",
            GitMergeMethod.SQUASH,
            deleteBranch = false,
            bypass = false
        )
        socket.receive("""{"t":"gitMergePrWhenReady","project":"storefront","ok":false}""")
        testScheduler.runCurrent()
        val state = store.state.value
        assertEquals("Couldn't set up the merge.", state.mergeErrors["storefront"])
        assertNull(store.watch())
        assertEquals(Haptic.Error, state.mergeFeedback["storefront"]?.haptic)
    }

    @Test
    fun `cancelling clears the wait once the Mac stops it`() = runTest {
        val (store, socket) = connected()
        socket.receive(watchFrame("waiting"))
        testScheduler.runCurrent()
        assertEquals("armed at the desk", 42, store.watch()?.number)

        store.cancelMergeWhenReady("storefront")
        assertEquals(
            JsonPrimitive("storefront"),
            socket.sentOf("gitMergePrCancel").single()["project"]
        )
        assertTrue("storefront" in store.state.value.arming)
        assertTrue("still armed until the Mac says", store.watch() != null)

        socket.receive("""{"t":"gitMergePrCancel","project":"storefront","ok":true}""")
        testScheduler.runCurrent()
        assertFalse("storefront" in store.state.value.arming)
        assertNull(store.watch())
        assertNull(store.state.value.mergeFeedback["storefront"])
    }

    @Test
    fun `a refused cancel keeps the wait`() = runTest {
        val (store, socket) = connected()
        socket.receive(watchFrame("waiting"))
        testScheduler.runCurrent()
        store.cancelMergeWhenReady("storefront")
        socket.receive("""{"t":"gitMergePrCancel","project":"storefront","ok":false}""")
        testScheduler.runCurrent()
        assertEquals("Couldn't stop the merge.", store.state.value.mergeErrors["storefront"])
        assertEquals(42, store.watch()?.number)
    }

    @Test
    fun `a wait that merged shows it merged and reloads`() = runTest {
        val (store, socket) = connected()
        socket.receive(watchFrame("waiting"))
        testScheduler.runCurrent()
        val gitBefore = socket.sentOf("git").size
        val checksBefore = socket.sentOf("gitChecks").size

        socket.receive(watchFrame("merged"))
        testScheduler.runCurrent()
        assertNull(store.watch())
        assertEquals(
            MergedPullRequest(42, "Two-step checkout flow", deletedBranch = true),
            store.state.value.merged["storefront"]
        )
        assertEquals(checksBefore + 1, socket.sentOf("gitChecks").size)
        assertEquals(gitBefore + 1, socket.sentOf("git").size)
    }

    @Test
    fun `a wait that stopped says why and reloads`() = runTest {
        val (store, socket) = connected()
        socket.receive(watchFrame("waiting"))
        testScheduler.runCurrent()
        val checksBefore = socket.sentOf("gitChecks").size

        socket.receive(watchFrame("stopped", ""","reason":"A check failed: test.""""))
        testScheduler.runCurrent()
        assertNull(store.watch())
        assertEquals(
            "Stopped waiting to merge #42. A check failed: test.",
            store.state.value.mergeErrors["storefront"]
        )
        assertNull(store.state.value.merged["storefront"])
        assertEquals(checksBefore + 1, socket.sentOf("gitChecks").size)

        socket.receive(watchFrame("waiting"))
        socket.receive(watchFrame("stopped"))
        testScheduler.runCurrent()
        assertEquals(
            "Stopped waiting to merge #42.",
            store.state.value.mergeErrors["storefront"]
        )
    }

    @Test
    fun `a cancelled wait just clears`() = runTest {
        val (store, socket) = connected()
        socket.receive(watchFrame("waiting"))
        socket.receive(watchFrame("cancelled"))
        testScheduler.runCurrent()
        assertNull(store.watch())
        assertNull(store.state.value.mergeErrors["storefront"])
    }

    @Test
    fun `bypassing merges now with bypass set`() = runTest {
        val (store, socket) = connected()
        store.merge("storefront", GitMergeMethod.SQUASH, deleteBranch = false, bypass = true)
        val sent = socket.sentOf("gitMergePr").single()
        assertEquals(JsonPrimitive(true), sent["bypass"])
        store.merge("storefront", GitMergeMethod.SQUASH, deleteBranch = false)
        assertNull(socket.sentOf("gitMergePr").last()["bypass"])
    }

    @Test
    fun `a dropped link stops arming`() = runTest {
        val (store, _) = connected()
        store.mergeWhenReady(
            "storefront",
            GitMergeMethod.SQUASH,
            deleteBranch = true,
            bypass = false
        )
        store.onConnectionReset()
        assertTrue(store.state.value.arming.isEmpty())
    }

    @Test
    fun `a Mac without gitMergeWhenReady can't wait to merge`() = runTest {
        val (store, _) = connected(
            listOf(LpmClient.GIT_CHECKS_FEATURE, LpmClient.GIT_MERGE_FEATURE)
        )
        assertFalse(store.canMergeWhenReady)
    }
}
