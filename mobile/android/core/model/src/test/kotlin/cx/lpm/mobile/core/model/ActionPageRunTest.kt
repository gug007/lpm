package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ActionPageRunTest {
    private fun action(
        name: String,
        label: String = name,
        inputs: List<ActionInput> = emptyList(),
        children: List<Action> = emptyList()
    ) = Action(
        name = name,
        label = label,
        emoji = "",
        type = "",
        display = "",
        layer = "",
        position = null,
        color = "",
        primary = "",
        cmd = "x",
        confirm = false,
        inputs = inputs,
        children = children
    )

    private val env = ActionInput(
        key = "env",
        label = "Env",
        type = "radio",
        required = true,
        placeholder = "",
        defaultValue = "",
        options = listOf(ActionInputOption("Staging", "staging"), ActionInputOption("Prod", "prod"))
    )
    private val note = ActionInput("note", "Note", "text", false, "", "", emptyList())

    @Test
    fun `reads what a page posts and nothing else`() {
        assertEquals(
            ActionPageAsk.Run("1", "deploy", mapOf("env" to "prod")),
            ActionPageAsk.parse(
                """{"lpmRun":{"id":"1","action":"deploy","inputs":{"env":"prod","n":3}}}"""
            )
        )
        assertEquals(ActionPageAsk.Refresh, ActionPageAsk.parse("""{"lpmRefresh":true}"""))
        assertNull(ActionPageAsk.parse("""{"lpmRun":{"id":1,"action":"deploy"}}"""))
        assertNull(ActionPageAsk.parse("""{"lpmOpen":"https://lpm.cx"}"""))
        assertNull(ActionPageAsk.parse("run"))
    }

    @Test
    fun `keeps the inputs a page filled the way the form would take them`() {
        val deploy = action("deploy", inputs = listOf(env, note))
        assertEquals(
            ActionPageInputs(mapOf("env" to "prod", "note" to ""), true),
            deploy.pageInputs(mapOf("env" to "prod", "note" to ""))
        )
        assertEquals(
            ActionPageInputs(mapOf("note" to "x"), false),
            deploy.pageInputs(mapOf("env" to "qa", "note" to "x"))
        )
        assertEquals(
            ActionPageInputs(emptyMap(), true),
            action("plain").pageInputs(mapOf("x" to "y"))
        )
    }

    @Test
    fun `finds the action a page names as the desktop does`() {
        val prod = action("deploy:production", label = "Production")
        val actions =
            listOf(
                action("deploy", label = "Deploy", children = listOf(prod)),
                action("seed", label = "Seed DB")
            )
        assertEquals("deploy", actions.pageAction("deploy")?.name)
        assertEquals("deploy:production", actions.pageAction("production")?.name)
        assertEquals("deploy:production", actions.pageAction("PRODUCTION")?.name)
        assertEquals("seed", actions.pageAction("seed db")?.name)
        assertNull(actions.pageAction("nope"))
    }

    @Test
    fun `hands back output without colors and a reply the page reads`() {
        assertEquals("ok\ndone", ActionPageRunResult.output("\u001B[32mok\u001B[0m\ndone\n"))
        val reply = Json.parseToJsonElement(
            ActionPageRunResult(ok = true, output = "a\"b").json("7")
        ).jsonObject
        assertEquals(
            """{"id":"7","ok":true,"output":"a\"b","error":"","canceled":false}""",
            reply.toString()
        )
    }
}
