package cx.lpm.mobile.core.demo

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DemoMergeWhenReadyTest {
    private fun DemoHarness.arm() = request(
        "gitMergePrWhenReady",
        "project" to "storefront",
        "number" to 42,
        "title" to "Two-step checkout flow",
        "method" to "rebase",
        "deleteBranch" to true,
        "bypass" to false
    )

    @Test
    fun anArmedMergeLandsOnceTheRerunPasses() = runTest {
        val demo = DemoHarness(this)
        demo.exchange(0.4, "gitChecksRerun", "project" to "storefront", "runIds" to listOf("7001"))

        val armed = demo.arm()
        assertEquals(listOf("gitMergePrWhenReady", "gitMergeWatch"), armed.map { it.t })
        assertEquals(true, armed[0].frame.bool("ok"))
        val watch = armed[1].frame.sub("watch")
        assertEquals("waiting", watch.string("state"))
        assertEquals(42, watch.int("number"))
        assertEquals("rebase", watch.string("method"))

        val running = demo.exchange(0.3, "gitChecks", "project" to "storefront").single("gitChecks")
        assertEquals("waiting", running.sub("mergeWatch").string("state"))

        demo.advance(9.0)
        assertEquals("still waiting", 1, demo.pushed.count { it.t == "gitMergeWatch" })

        demo.clear()
        demo.advance(1.0)
        val merged = demo.pushed.single { it.t == "gitMergeWatch" }
        assertEquals(6_000L + 4_000L, merged.at)
        assertEquals("merged", merged.frame.sub("watch").string("state"))
        assertEquals(true, merged.frame.sub("watch").bool("deletedBranch"))

        val after = demo.exchange(0.3, "gitChecks", "project" to "storefront").single("gitChecks")
        assertNull("merged leaves storefront without CI", after.dict("pr"))
        assertNull(after["mergeWatch"])
    }

    @Test
    fun cancellingStopsTheWait() = runTest {
        val demo = DemoHarness(this)
        demo.exchange(0.4, "gitChecksRerun", "project" to "storefront", "runIds" to listOf("7001"))
        demo.arm()
        val cancel = demo.request("gitMergePrCancel", "project" to "storefront")
        assertEquals(listOf("gitMergeWatch", "gitMergePrCancel"), cancel.map { it.t })
        assertEquals("cancelled", cancel[0].frame.sub("watch").string("state"))

        val later = demo.exchange(11.0, "gitChecks", "project" to "storefront")
        assertEquals(listOf("gitChecks"), later.map { it.t })
        assertNull(later.single("gitChecks")["mergeWatch"])
        assertEquals(42, later.single("gitChecks").sub("pr").int("number"))

        val again = demo.request("gitMergePrCancel", "project" to "storefront").map { it.t }
        assertEquals("nothing armed, only the reply", listOf("gitMergePrCancel"), again)
    }
}
