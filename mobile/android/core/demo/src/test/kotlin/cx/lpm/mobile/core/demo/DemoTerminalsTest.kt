package cx.lpm.mobile.core.demo

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DemoTerminalsTest {
    private val prompt = "\u001B[1;36m~/dev/storefront\u001B[0m \u001B[2m$\u001B[0m "

    private fun DemoHarness.type(id: String, d: String): List<String?> =
        request("in", "id" to id, "d" to d).map { it.frame.string("d") }

    private fun DemoHarness.agentStatus(): String? =
        request("status", "project" to "storefront").single("status")
            .dictList("status").single().string("value")

    @Test
    fun storefrontHasAShellAndAClaudeSession() = runTest {
        val demo = DemoHarness(this)
        val terminals = demo.request("terminals", "project" to "storefront").single("terminals")
            .dictList("terminals")

        assertEquals(
            listOf("demo-storefront-1", "demo-storefront-claude"),
            terminals.map { it.string("id") }
        )
        assertEquals(listOf("Terminal 1", "Claude"), terminals.map { it.string("label") })
        assertEquals(listOf("", "✻"), terminals.map { it.string("emoji") })
        assertEquals(listOf("", "claude"), terminals.map { it.string("cli") })
    }

    @Test
    fun subscribeSeedsTheScreenAndOwner() = runTest {
        val demo = DemoHarness(this)
        val seed = demo.request("sub", "id" to "demo-storefront-1").single("seed")

        val dirs = listOf("app", "components", "lib", "public")
            .joinToString("  ") { "\u001B[1;34m$it\u001B[0m" }
        val ls = "$dirs  next.config.mjs  package.json  README.md  tsconfig.json\r\n"
        assertEquals(prompt + "ls\r\n" + ls + prompt, seed.string("data"))
        assertEquals(80, seed.int("cols"))
        assertEquals(
            mapOf("kind" to "mobile", "id" to "demo-device", "label" to "This device"),
            seed.sub("owner")
        )
    }

    @Test
    fun shellEchoesInputAndRunsCommands() = runTest {
        val demo = DemoHarness(this)
        demo.send("sub", "id" to "demo-storefront-1")

        assertEquals(listOf("pw"), demo.type("demo-storefront-1", "pw"))
        assertEquals(
            listOf("d\r\n", "/Users/demo/dev/storefront\r\n$prompt"),
            demo.type("demo-storefront-1", "d\r")
        )

        demo.send("in", "id" to "demo-storefront-1", "d" to "npm test\r")
        demo.clear()
        demo.advance(1.3)
        val results = demo.pushed.single().frame.string("d")!!
        assertTrue(results.contains("23 passed"))
        assertTrue(results.endsWith(prompt))
    }

    @Test
    fun devLogTicksWhileSubscribedToARunningProject() = runTest {
        val demo = DemoHarness(this)
        demo.send("sub", "id" to "demo-storefront-1")
        demo.clear()
        demo.advance(8.0)

        val tick = demo.pushed.single().frame.string("d")!!
        assertTrue(devLogLines.any { tick == "\r\u001B[2K" + it + "\r\n" + prompt })
        demo.send("unsub", "id" to "demo-storefront-1")
        demo.clear()
        demo.advance(20.0)
        assertTrue(demo.pushed.isEmpty())
    }

    @Test
    fun claudeSessionPlaysItsScriptThenAcknowledges() = runTest {
        val demo = DemoHarness(this)
        val seed = demo.request("sub", "id" to "demo-storefront-claude")
        assertEquals(listOf("seed", "status-changed"), seed.map { it.t })
        assertEquals(
            "Add Apple Pay as a payment option in the new checkout flow",
            seed.single("seed").sub("draft").string("text")
        )
        assertEquals("Running", demo.agentStatus())

        demo.clear()
        demo.advance(37.0)
        val output = demo.pushed.filter { it.t == "o" }
        assertEquals(12, output.size)
        assertEquals(900L, output.first().at)
        assertTrue(output.last().frame.string("d")!!.startsWith("\u001B[?2004h"))
        assertEquals("Waiting", demo.agentStatus())

        demo.clear()
        demo.send("in", "id" to "demo-storefront-claude", "d" to "ok\r")
        demo.advance(1.1)
        val ack = demo.pushed.filter { it.t == "o" }.map { it.frame.string("d")!! }
        assertEquals(listOf("ok", "\r\n"), ack.take(2))
        assertTrue(ack[2].contains("Noted — I'll fold that into the checkout work."))
    }

    @Test
    fun storefrontMentionsOfferTheMacMini() = runTest {
        val demo = DemoHarness(this)
        val reply = demo.request("mentions", "project" to "storefront").single("mentions")
        val mini = reply.dictList("computers").single()

        assertEquals("Mac mini", mini.string("name"))
        assertEquals("commands · copy from it", mini.string("access"))
        assertEquals(
            listOf(
                mapOf(
                    "label" to "storefront",
                    "path" to "Mac mini:~/storefront",
                    "insert" to "Mac mini:~/storefront (on another computer; reach it with " +
                        "lpm exec --on and lpm cp)"
                ),
                mapOf(
                    "label" to "Home folder",
                    "path" to "Mac mini:~",
                    "insert" to "Mac mini:~ (on another computer; reach it with " +
                        "lpm exec --on and lpm cp)"
                )
            ),
            mini.dictList("places")
        )
        val blog = demo.request("mentions", "project" to "blog").single("mentions")
        assertNull(blog["computers"])
    }

    @Test
    fun composerDraftsCarryAGlobalRevision() = runTest {
        val demo = DemoHarness(this)
        val reply = demo.request("composerDraft", "id" to "demo-storefront-1", "text" to "hello")
            .single("composerDraft")

        assertEquals(2, reply.int("rev"))
        assertEquals("demo-device", reply.string("origin"))
        assertEquals(
            mapOf("text" to "hello", "rev" to 2L),
            demo.request("sub", "id" to "demo-storefront-1").single("seed").sub("draft")
        )
    }
}
