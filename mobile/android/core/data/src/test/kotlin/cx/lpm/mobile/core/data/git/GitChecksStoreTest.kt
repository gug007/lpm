package cx.lpm.mobile.core.data.git

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.FakeSocket
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.GitMergeMethod
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
class GitChecksStoreTest {
    private val ready =
        """{"t":"gitChecks","project":"storefront","ok":true,"branch":"feat/x","commit":null,""" +
            """"pr":{"number":42,"url":"https://github.com/o/r/pull/42",""" +
            """"title":"Two-step checkout flow","isDraft":false,""" +
            """"checks":[{"name":"test","workflow":"CI","state":"pass","url":""}],""" +
            """"merge":{"mergeable":"MERGEABLE","state":"CLEAN","review":"APPROVED",""" +
            """"head":"4b8e2f1","methods":["merge","squash"],"deletesBranch":false}}}"""

    private fun TestScope.connected(
        features: List<String> = listOf(
            LpmClient.GIT_CHECKS_FEATURE,
            LpmClient.GIT_MERGE_FEATURE
        )
    ): Pair<GitChecksStore, FakeSocket> {
        val h = SessionHarness(this)
        val socket = h.connectReady(features)
        socket.receive(ready)
        testScheduler.runCurrent()
        return h.session.store<GitChecksStore>() to socket
    }

    @Test
    fun `merging sends the pull request's head and the method, then asks again`() = runTest {
        val (store, socket) = connected()
        assertTrue(store.canMerge)
        assertEquals("4b8e2f1", store.state.value.results["storefront"]?.pr?.merge?.head)
        val gitBefore = socket.sentOf("git").size
        val checksBefore = socket.sentOf("gitChecks").size

        store.merge("storefront", GitMergeMethod.SQUASH, deleteBranch = true)
        val sent = socket.sentOf("gitMergePr").single()
        assertEquals(JsonPrimitive(42), sent["number"])
        assertEquals(JsonPrimitive("squash"), sent["method"])
        assertEquals(JsonPrimitive("4b8e2f1"), sent["head"])
        assertEquals(JsonPrimitive(true), sent["deleteBranch"])
        assertTrue("storefront" in store.state.value.merging)

        socket.receive(
            """{"t":"gitMergePr","project":"storefront","ok":true,"number":42,"deletedBranch":true}"""
        )
        testScheduler.runCurrent()
        val state = store.state.value
        assertFalse("storefront" in state.merging)
        assertEquals(
            MergedPullRequest(42, "Two-step checkout flow", deletedBranch = true),
            state.merged["storefront"]
        )
        assertEquals(checksBefore + 1, socket.sentOf("gitChecks").size)
        assertEquals(gitBefore + 1, socket.sentOf("git").size)

        store.forgetMerge("storefront")
        assertNull(store.state.value.merged["storefront"])
    }

    @Test
    fun `a refused merge says why until the sheet closes`() = runTest {
        val (store, socket) = connected()
        store.merge("storefront", GitMergeMethod.MERGE, deleteBranch = false)
        socket.receive("""{"t":"gitMergePr","project":"storefront","ok":false}""")
        testScheduler.runCurrent()
        assertEquals(
            "Couldn't merge the pull request.",
            store.state.value.mergeErrors["storefront"]
        )
        assertNull(store.state.value.merged["storefront"])

        store.merge("storefront", GitMergeMethod.MERGE, deleteBranch = false)
        assertNull(
            "a new attempt clears the old error",
            store.state.value.mergeErrors["storefront"]
        )
        socket.receive(
            """{"t":"gitMergePr","project":"storefront","ok":false,"error":"Head moved"}"""
        )
        testScheduler.runCurrent()
        assertEquals("Head moved", store.state.value.mergeErrors["storefront"])
        store.forgetMerge("storefront")
        assertNull(store.state.value.mergeErrors["storefront"])
    }

    @Test
    fun `a dropped link stops the spinner`() = runTest {
        val (store, _) = connected()
        store.merge("storefront", GitMergeMethod.SQUASH, deleteBranch = true)
        store.onConnectionReset()
        assertTrue(store.state.value.merging.isEmpty())
    }

    @Test
    fun `a Mac without gitMerge can't merge`() = runTest {
        val (store, _) = connected(listOf(LpmClient.GIT_CHECKS_FEATURE))
        assertFalse(store.canMerge)
    }
}
