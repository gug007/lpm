package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.ConversationItem
import cx.lpm.mobile.core.model.ConversationItem.Kind
import cx.lpm.mobile.core.model.ConversationPart
import cx.lpm.mobile.core.model.ConversationTool
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConversationFrameTest {
    @Test
    fun requests() {
        assertFrame(
            """{"t":"conversationWatch","id":"p-1","project":"api"}""",
            Wire.conversationWatch("p-1", "api")
        )
        assertFrame(
            """{"t":"conversationUnwatch","id":"p-1"}""",
            Wire.conversationUnwatch("p-1")
        )
        assertFrame(
            """{"t":"conversationPage","id":"p-1","project":"api","before":"e-9","reqId":"r"}""",
            Wire.conversationPage("p-1", "api", "e-9", "r")
        )
        assertFrame(
            """{"t":"conversationDetail","id":"p-1","project":"api","item":"e-9","reqId":"r"}""",
            Wire.conversationDetail("p-1", "api", "e-9", "r")
        )
    }

    @Test
    fun aPushCarriesEveryKindOfEntry() {
        val update = decode<ConversationPush>(
            """{"t":"conversation","id":"p-1","project":"api","ok":true,"reset":true,"more":true,
                "items":[
                  {"id":"a","kind":"prompt","text":"Fix it","images":2},
                  {"id":"b","kind":"text","text":"**Done**"},
                  {"id":"c","kind":"tool","what":"edit","verb":"Edited","subject":"a.ts",
                   "code":true,"path":"/p/a.ts","added":4,"removed":1,"note":"n","state":"failed"},
                  {"id":"d","kind":"notice","text":"Interrupted"},
                  {"id":"e","kind":"somethingNew"},
                  {"kind":"text","text":"no id"}]}"""
        ).update
        assertTrue(update.reset)
        assertTrue(update.more)
        assertNull(update.error)
        assertEquals(
            listOf(
                ConversationItem("a", Kind.Prompt("Fix it", 2)),
                ConversationItem("b", Kind.Text("**Done**")),
                ConversationItem(
                    "c",
                    Kind.Tool(
                        ConversationTool(
                            "edit", "Edited", "a.ts", true, "/p/a.ts", 4, 1, "n",
                            ConversationTool.State.Failed
                        )
                    )
                ),
                ConversationItem("d", Kind.Notice("Interrupted"))
            ),
            update.items
        )
    }

    @Test
    fun aFailureSaysWhy() {
        val failed = decode<ConversationPush>(
            """{"t":"conversation","id":"p-1","ok":false,"error":"No project"}"""
        ).update
        assertEquals("No project", failed.error)
        val page = decode<ConversationPageReply>(
            """{"t":"conversationPage","id":"p-1","ok":false,"reqId":"r"}"""
        )
        assertNull(page.page)
    }

    @Test
    fun repliesArePairedByTheirRequest() {
        val page = decode<ConversationPageReply>(
            """{"t":"conversationPage","ok":true,"items":[{"id":"a","kind":"notice","text":"x"}],
                "more":true,"reqId":"r-1"}"""
        )
        assertEquals("r-1", page.reqId)
        assertEquals(listOf("a"), page.page?.items?.map { it.id })
        assertEquals(true, page.page?.more)
        val detail = decode<ConversationDetailReply>(
            """{"t":"conversationDetail","ok":true,"item":"a","reqId":"r-2","parts":[
                {"label":"Command","style":"code","text":"npm test"},{"style":"diff","text":"+a"}]}"""
        )
        assertEquals("r-2", detail.reqId)
        assertEquals(
            listOf(
                ConversationPart("Command", ConversationPart.Style.Code, "npm test"),
                ConversationPart("", ConversationPart.Style.Diff, "+a")
            ),
            detail.parts
        )
    }
}
