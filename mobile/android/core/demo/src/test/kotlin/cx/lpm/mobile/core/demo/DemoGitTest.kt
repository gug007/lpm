package cx.lpm.mobile.core.demo

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DemoGitTest {
    @Test
    fun statusArrivesAfterASimulatedDelay() = runTest {
        val demo = DemoHarness(this)
        val frames = demo.exchange(0.3, "git", "project" to "storefront")
        val git = frames.single("git")

        assertEquals(300L, frames.single().at)
        assertEquals("feat/checkout-redesign", git.string("branch"))
        assertEquals(2, git.int("ahead"))
        assertEquals(
            listOf(
                "components/CheckoutForm.tsx" to "modified",
                "app/checkout/page.tsx" to "modified",
                "lib/payments.ts" to "added",
                "README.md" to "modified"
            ),
            git.dictList("files").map { it.string("path") to it.string("status") }
        )
        assertEquals(null, git["autoPulled"])
        val gateway = demo.exchange(0.3, "git", "project" to "api-gateway").single("git")
        assertEquals(3, gateway.sub("autoPulled").int("count"))
    }

    @Test
    fun diffsComeFromTheCannedFixtures() = runTest {
        val demo = DemoHarness(this)
        val diff = demo.request("gitDiff", "project" to "storefront", "path" to "lib/payments.ts")
            .single("gitDiff").string("diff")!!

        assertTrue(
            diff.startsWith(
                "diff --git a/lib/payments.ts b/lib/payments.ts\nnew file mode 100644\n"
            )
        )
        assertTrue(diff.endsWith("+  return res.json()\n+}"))
        val generic = demo.request("gitDiff", "project" to "blog", "path" to "src/a.ts")
            .single("gitDiff").string("diff")!!
        assertTrue(generic.contains("\n-const enabled = false\n+const enabled = true\n"))
    }

    @Test
    fun branchesSortNewestFirstWithIsoDates() = runTest {
        val demo = DemoHarness(this)
        val branches = demo.request("gitBranches", "project" to "storefront").single("gitBranches")
            .dictList("branches")

        assertEquals(
            listOf(
                mapOf(
                    "name" to "feat/checkout-redesign",
                    "committerDate" to "2026-10-15T18:30:00Z"
                ),
                mapOf("name" to "main", "committerDate" to "2026-10-12T18:30:00Z"),
                mapOf(
                    "name" to "main",
                    "committerDate" to "2026-10-12T18:30:00Z",
                    "remote" to "origin"
                ),
                mapOf("name" to "fix/cart-badge", "committerDate" to "2026-10-10T18:30:00Z")
            ),
            branches
        )
    }

    @Test
    fun commitNotifiesWatchers() = runTest {
        val demo = DemoHarness(this)
        demo.request("gitWatch", "project" to "storefront")
        val frames = demo.exchange(
            1.0,
            "gitCommit",
            "project" to "storefront",
            "message" to "wip",
            "files" to listOf("README.md")
        )

        assertEquals(
            listOf(400L to "gitCommit", 500L to "git-changed"),
            frames.map { it.at to it.t }
        )
        val git = demo.exchange(0.3, "git", "project" to "storefront").single("git")
        assertEquals(3, git.int("ahead"))
        assertEquals(3, git.dictList("files").size)
    }

    @Test
    fun keepFixingPlaysTwoRoundsThenPasses() = runTest {
        val demo = DemoHarness(this)
        val failing = demo.exchange(0.3, "gitChecks", "project" to "storefront").single("gitChecks")
        assertTrue(failing.string("fixLoopPrompt")!!.endsWith("(round 1 of 3)."))

        val frames = demo.exchange(
            29.0,
            "ciFixLoop",
            "project" to "storefront",
            "on" to true,
            "agent" to "Claude Code"
        ).filter { it.t == "ciFixLoop" }
        assertEquals(
            listOf("starting", "fixing", "watching", "fixing", "watching", "passed"),
            frames.map { it.frame.sub("loop").string("state") }
        )
        assertEquals("CI passed after 2 rounds", frames.last().frame.sub("loop").string("detail"))

        val passed = demo.exchange(0.3, "gitChecks", "project" to "storefront").single("gitChecks")
        assertEquals("passed", passed.sub("fixLoop").string("state"))
        assertEquals(null, passed["fixPrompt"])
    }

    @Test
    fun stoppingKeepFixingSaysSoAndSendsNoMore() = runTest {
        val demo = DemoHarness(this)
        demo.exchange(3.0, "ciFixLoop", "project" to "storefront", "on" to true, "agent" to "Codex")
        val stop = demo.exchange(20.0, "ciFixLoop", "project" to "storefront", "on" to false)
        assertEquals(
            listOf("cancelled"),
            stop.filter { it.t == "ciFixLoop" }.map { it.frame.sub("loop").string("state") }
        )
    }
}
