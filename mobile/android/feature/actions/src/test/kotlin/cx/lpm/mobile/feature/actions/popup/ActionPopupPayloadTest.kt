package cx.lpm.mobile.feature.actions.popup

import androidx.compose.ui.graphics.Color
import cx.lpm.mobile.core.designsystem.theme.DarkLpmColors
import cx.lpm.mobile.core.designsystem.theme.LightLpmColors
import cx.lpm.mobile.core.model.ActionPopupContent
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class ActionPopupPayloadTest {
    private fun content(data: String = "null", text: String = "", dataError: String = "") =
        ActionPopupContent(
            refresh = 0,
            html = "<p>",
            data = Json.parseToJsonElement(data),
            text = text,
            dataError = dataError,
            error = ""
        )

    @Test
    fun noLessThanSignOrLineSeparatorReachesTheScript() {
        val payload = ActionPopupPayload.bootstrap(
            content(
                data = """{"note":"</script><script>alert(1)</script>"}""",
                text = "a b c"
            ),
            project = "<api>",
            action = "stars",
            colors = DarkLpmColors
        )
        assertFalse('<' in payload)
        assertFalse(' ' in payload)
        assertFalse(' ' in payload)
        val parsed = Json.parseToJsonElement(payload).jsonObject
        assertEquals(
            "</script><script>alert(1)</script>",
            parsed["data"]!!.jsonObject["note"]!!.jsonPrimitive.content
        )
        assertEquals("a b c", parsed["text"]!!.jsonPrimitive.content)
        assertEquals("<api>", parsed["project"]!!.jsonPrimitive.content)
    }

    @Test
    fun thePayloadCarriesTheDataItsErrorAndTheTheme() {
        val parsed = Json.parseToJsonElement(
            ActionPopupPayload.bootstrap(
                content(data = """{"total":3}""", dataError = "gh: not logged in"),
                project = "api",
                action = "stars",
                colors = LightLpmColors
            )
        ).jsonObject
        assertEquals("""{"total":3}""", parsed["data"].toString())
        assertEquals("gh: not logged in", parsed["error"]!!.jsonPrimitive.content)
        assertEquals("stars", parsed["action"]!!.jsonPrimitive.content)
        val theme = parsed["theme"]!!.jsonObject
        assertEquals("light", theme["mode"]!!.jsonPrimitive.content)
        assertEquals(
            setOf("bg", "surface", "text", "muted", "border", "accent", "green", "red", "amber"),
            theme["colors"]!!.jsonObject.keys
        )
        assertEquals(
            JsonNull,
            Json.parseToJsonElement(ActionPopupPayload.push(content()))
                .jsonObject["data"]
        )
    }

    @Test
    fun colorsAreCssHexOrRgba() {
        assertEquals("#f2f2f7", ActionPopupPayload.css(LightLpmColors.systemGroupedBackground))
        assertEquals(
            "rgba(60, 60, 67, 0.60)",
            ActionPopupPayload.css(LightLpmColors.secondaryLabel)
        )
        assertEquals("rgba(84, 84, 88, 0.60)", ActionPopupPayload.css(DarkLpmColors.separator))
        assertEquals("#ffffff", ActionPopupPayload.css(Color.White))
        assertEquals(
            "dark",
            ActionPopupPayload.theme(DarkLpmColors)["mode"]!!.jsonPrimitive.content
        )
    }
}
