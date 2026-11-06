package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.Action
import cx.lpm.mobile.core.model.ActionPopupContent
import cx.lpm.mobile.core.model.ActionPopupCopy
import cx.lpm.mobile.core.model.ActionPopupInfo
import cx.lpm.mobile.core.model.ActionPopupReply
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class InboundActionPopupTest {
    @Test
    fun aPopupReplyCarriesThePageAndItsData() {
        val reply = decode<Inbound.ActionPopup>(
            """{ "t": "actionPopup", "project": "api", "action": "deploy:stars", "ok": true,
                 "popup": { "format": "html", "title": "GitHub stars", "width": 380, "height": 200,
                            "refresh": 30, "html": "<p>hi</p>", "data": { "total": 3 }, "text": "",
                            "dataError": "gh: not logged in", "updatedAt": 1792089000123,
                            "stale": true, "refreshError": "exit 1" } }"""
        ).reply
        assertEquals("api", reply.project)
        assertEquals("deploy:stars", reply.action)
        assertEquals("", reply.error)
        assertEquals(
            ActionPopupContent(
                format = "html",
                title = "GitHub stars",
                height = 200,
                refresh = 30,
                html = "<p>hi</p>",
                data = Json.parseToJsonElement("""{ "total": 3 }"""),
                text = "",
                dataError = "gh: not logged in",
                error = "",
                updatedAt = 1792089000123,
                stale = true,
                refreshError = "exit 1"
            ),
            reply.content
        )
    }

    @Test
    fun missingFieldsFallBackToDefaults() {
        val content = decode<Inbound.ActionPopup>(
            """{ "t": "actionPopup", "ok": true, "popup": { "width": "wide", "refresh": -4,
                 "error": "Can't find popups/x.html." } }"""
        ).reply.content!!
        assertEquals("html", content.format)
        assertEquals(220, content.height)
        assertEquals(0, content.refresh)
        assertNull(content.html)
        assertEquals(JsonNull, content.data)
        assertEquals("Can't find popups/x.html.", content.error)
        assertEquals(0, content.updatedAt)
        assertFalse(content.stale)
        assertEquals("", content.refreshError)
    }

    @Test
    fun aRefusalOrAMalformedReplyReadsAsAnError() {
        assertEquals(
            ActionPopupReply("api", "x", null, "No action named x."),
            decode<Inbound.ActionPopup>(
                """{ "t": "actionPopup", "project": "api", "action": "x", "ok": false,
                     "error": "No action named x." }"""
            ).reply
        )
        for (frame in listOf(
            """{ "t": "actionPopup", "ok": false }""",
            """{ "t": "actionPopup", "ok": false, "error": "" }""",
            """{ "t": "actionPopup", "ok": true }""",
            """{ "t": "actionPopup", "ok": true, "popup": "page" }""",
            """{ "t": "actionPopup", "popup": { "html": "<p>" } }"""
        )) {
            val reply = decode<Inbound.ActionPopup>(frame).reply
            assertNull(frame, reply.content)
            assertEquals(frame, ActionPopupCopy.COULD_NOT_OPEN, reply.error)
        }
    }

    @Test
    fun anActionCarriesItsPopupInfo() {
        val action = Action.parse(
            Json.parseToJsonElement(
                """{ "name": "stars", "popup": { "format": "html", "title": "GitHub stars",
                     "width": 380, "height": 200 },
                     "children": [ { "name": "stars:week", "popup": { "format": "vega",
                       "problem": "names 2 formats (html, vega); keep one" } } ] }"""
            ).jsonObject
        )
        assertEquals(ActionPopupInfo("html", "GitHub stars", 200, ""), action.popup)
        assertEquals(
            ActionPopupInfo("vega", "", 220, "names 2 formats (html, vega); keep one"),
            action.children.single().popup
        )
        assertNull(Action.parse(Json.parseToJsonElement("""{ "name": "test" }""").jsonObject).popup)
    }
}
