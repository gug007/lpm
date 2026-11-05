package cx.lpm.mobile.core.demo

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DemoAgentDialogTest {
    private fun DemoHarness.dialog(terminal: String = TERMINAL): Dict =
        request("agentDialog", "project" to "storefront", "terminalId" to terminal)
            .single("agentDialog")

    /** The Claude tab runs its sample turn and ends waiting on the cart badge question. */
    private fun DemoHarness.waiting(): Dict {
        send("sub", "id" to TERMINAL)
        advance(37.0)
        clear()
        return dialog()
    }

    private fun DemoHarness.pick(read: Dict, vararg overrides: Pair<String, Any?>): Dict {
        val fields = mapOf(
            "project" to "storefront",
            "terminalId" to TERMINAL,
            "key" to read["key"],
            "ts" to read["ts"],
            "action" to "pick",
            "option" to "1",
            "dialog" to read.sub("dialog")["id"],
            "reqId" to "p-1"
        ) + overrides
        return exchange(0.3, "answerAgent", *fields.toList().toTypedArray()).single("answerAgent")
    }

    private fun DemoHarness.claudeStatus(): String? =
        request("status", "project" to "storefront").single("status")
            .dictList("status").single().string("value")

    @Test
    fun theWaitingClaudeTabAsksAboutTheCartBadge() = runTest {
        val demo = DemoHarness(this)
        val shell = demo.dialog("demo-storefront-1")
        assertEquals(JsonNull, shell["dialog"])
        assertTrue("key" !in shell)

        val read = demo.waiting()
        assertEquals("claude_code_$TERMINAL", read.string("key"))
        val status = demo.request("status", "project" to "storefront").single("status")
            .dictList("status").single()
        assertEquals("Waiting", status.string("value"))
        assertEquals(status.long("timestamp"), read.long("ts"))
        val dialog = read.sub("dialog")
        assertEquals("demo-cart-badge", dialog.string("id"))
        assertEquals(
            "Update the cart badge to match the new checkout flow?",
            dialog.string("question")
        )
        assertEquals(emptyList<String>(), dialog.strings("details"))
        assertEquals(
            listOf(
                mapOf(
                    "key" to "1",
                    "label" to "Yes, update it",
                    "description" to "Show the step count in the badge",
                    "typed" to false
                ),
                mapOf("key" to "2", "label" to "Not now", "description" to "", "typed" to false),
                mapOf(
                    "key" to "3",
                    "label" to "Type something.",
                    "description" to "",
                    "typed" to true
                )
            ),
            dialog.dictList("options")
        )
    }

    @Test
    fun aPickAnswersOnceAndClaudeReplies() = runTest {
        val demo = DemoHarness(this)
        val read = demo.waiting()

        assertEquals(mapOf("t" to "answerAgent", "ok" to true, "reqId" to "p-1"), demo.pick(read))
        assertEquals("Running", demo.claudeStatus())
        demo.advance(1.1)
        val ack = demo.pushed.filter { it.t == "o" }.joinToString("") { it.frame.string("d")!! }
        assertTrue(ack.contains("Noted — I'll fold that into the checkout work."))
        assertEquals("Waiting", demo.claudeStatus())

        val again = demo.dialog()
        assertEquals(JsonNull, again["dialog"])
        assertEquals("claude_code_$TERMINAL", again.string("key"))
    }

    @Test
    fun aTypedPickOpensNoReply() = runTest {
        val demo = DemoHarness(this)
        val read = demo.waiting()

        assertEquals(true, demo.pick(read, "option" to "3")["ok"])
        demo.advance(1.1)
        assertEquals("Waiting", demo.claudeStatus())
        assertTrue(demo.pushed.none { it.t == "o" })
        assertEquals(JsonNull, demo.dialog()["dialog"])
    }

    @Test
    fun aStalePickSaysWhy() = runTest {
        val demo = DemoHarness(this)
        val read = demo.waiting()

        assertEquals(
            "This prompt was already answered.",
            demo.pick(read, "ts" to 5L).string("error")
        )
        assertEquals(
            "The question changed. Check it again before answering.",
            demo.pick(read, "dialog" to "0123456789abcdef").string("error")
        )
        assertEquals(
            "That choice isn't one the question offers.",
            demo.pick(read, "option" to "9").string("error")
        )
        assertEquals(
            "This prompt was already answered.",
            demo.pick(read, "terminalId" to "demo-storefront-1").string("error")
        )
        assertEquals(false, demo.pick(read, "ts" to 5L)["ok"])
        assertEquals("Waiting", demo.claudeStatus())
    }

    private companion object {
        const val TERMINAL = "demo-storefront-claude"
    }
}
