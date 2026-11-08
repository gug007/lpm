package cx.lpm.mobile.core.protocol

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class WireConfigNotesTest {
    private val payload = buildJsonObject {
        put("cmd", "npm start")
        put("port", 3000)
    }

    @Test
    fun rawConfig() {
        assertFrame(
            """{ "t": "readConfig", "project": "a", "layer": "repo" }""",
            Wire.readConfig("a", "repo")
        )
        assertFrame(
            """{ "t": "saveConfig", "project": "a", "layer": "project", "content": "name: a\n" }""",
            Wire.saveConfig("a", "project", "name: a\n")
        )
        assertFrame(
            """{ "t": "serviceBody", "project": "a", "key": "web" }""",
            Wire.serviceBody("a", "web")
        )
        assertFrame(
            """{ "t": "actionBody", "project": "a", "key": "deploy:prod" }""",
            Wire.actionBody("a", "deploy:prod")
        )
    }

    @Test
    fun serviceAndProfileEditsOmitAnEmptyPreviousName() {
        assertFrame(
            """{ "t": "saveService", "project": "a", "key": "web", "payload": { "cmd": "npm start", "port": 3000 } }""",
            Wire.saveService("a", "web", payload, previousKey = "")
        )
        assertFrame(
            """{ "t": "saveService", "project": "a", "key": "web", "payload": { "cmd": "npm start", "port": 3000 },
                 "previousKey": "app" }""",
            Wire.saveService("a", "web", payload, previousKey = "app")
        )
        assertFrame(
            """{ "t": "deleteService", "project": "a", "key": "web" }""",
            Wire.deleteService("a", "web")
        )
        assertFrame(
            """{ "t": "saveProfile", "project": "a", "name": "full", "services": ["web", "api"] }""",
            Wire.saveProfile("a", "full", listOf("web", "api"), previousName = null)
        )
        assertFrame(
            """{ "t": "saveProfile", "project": "a", "name": "full", "services": [], "previousName": "all" }""",
            Wire.saveProfile("a", "full", emptyList(), previousName = "all")
        )
        assertFrame(
            """{ "t": "deleteProfile", "project": "a", "name": "full" }""",
            Wire.deleteProfile("a", "full")
        )
    }

    @Test
    fun actionEdits() {
        assertFrame(
            """{ "t": "saveAction", "project": "a", "key": "deploy", "payload": { "cmd": "npm start", "port": 3000 } }""",
            Wire.saveAction("a", "deploy", payload, previousKey = null, section = "")
        )
        assertFrame(
            """{ "t": "saveAction", "project": "a", "key": "deploy", "payload": { "cmd": "npm start", "port": 3000 },
                 "previousKey": "ship", "section": "terminals" }""",
            Wire.saveAction("a", "deploy", payload, previousKey = "ship", section = "terminals")
        )
        assertFrame(
            """{ "t": "deleteAction", "project": "a", "key": "deploy" }""",
            Wire.deleteAction("a", "deploy")
        )
    }

    @Test
    fun serviceLogs() {
        assertFrame("""{ "t": "services", "project": "a" }""", Wire.services("a"))
        assertFrame(
            """{ "t": "serviceLogs", "project": "a", "paneIndex": 1, "lines": 500 }""",
            Wire.serviceLogs("a", 1, 500)
        )
        assertFrame(
            """{ "t": "serviceLogsWatch", "project": "a", "paneIndex": 1 }""",
            Wire.serviceLogsWatch("a", 1, watch = true)
        )
        assertFrame(
            """{ "t": "serviceLogsUnwatch", "project": "a", "paneIndex": 1 }""",
            Wire.serviceLogsWatch("a", 1, watch = false)
        )
    }

    @Test
    fun memory() {
        assertFrame("""{ "t": "memory", "project": "a" }""", Wire.memory("a"))
        assertFrame(
            """{ "t": "memorySession", "project": "a", "name": "auth" }""",
            Wire.memorySession("a", "auth")
        )
        assertFrame(
            """{ "t": "memorySave", "project": "a", "name": "auth", "content": "# Auth" }""",
            Wire.memorySave("a", "auth", "# Auth", baseline = null)
        )
        assertFrame(
            """{ "t": "memorySave", "project": "a", "name": "auth", "content": "# Auth", "baseline": "" }""",
            Wire.memorySave("a", "auth", "# Auth", baseline = "")
        )
        assertFrame(
            """{ "t": "memoryDelete", "project": "a", "name": "auth" }""",
            Wire.memoryDelete("a", "auth")
        )
    }

    @Test
    fun notes() {
        assertFrame("""{ "t": "notesChats", "project": "a" }""", Wire.notesChats("a"))
        assertFrame(
            """{ "t": "notesCreateChat", "project": "a", "title": "Ideas" }""",
            Wire.notesCreateChat("a", "Ideas")
        )
        assertFrame(
            """{ "t": "notesRenameChat", "project": "a", "chatId": "c-1", "title": "Todo" }""",
            Wire.notesRenameChat("a", "c-1", "Todo")
        )
        assertFrame(
            """{ "t": "notesDeleteChat", "project": "a", "chatId": "c-1" }""",
            Wire.notesDeleteChat("a", "c-1")
        )
        assertFrame(
            """{ "t": "notesMessages", "project": "a", "chatId": "c-1", "limit": 50, "beforeId": "" }""",
            Wire.notesMessages("a", "c-1", 50, "")
        )
        val attachment = buildJsonObject {
            put("name", "a.png")
            put("mimeType", "image/png")
            put("data", "aGk=")
        }
        assertFrame(
            """{ "t": "notesAddMessage", "project": "a", "chatId": "c-1", "text": "look",
                 "attachments": [{ "name": "a.png", "mimeType": "image/png", "data": "aGk=" }] }""",
            Wire.notesAddMessage("a", "c-1", "look", listOf(attachment))
        )
        assertFrame(
            """{ "t": "notesAddMessage", "project": "a", "chatId": "c-1", "text": "plain", "attachments": [] }""",
            Wire.notesAddMessage("a", "c-1", "plain", emptyList())
        )
        assertFrame(
            """{ "t": "notesAddMessage", "project": "a", "chatId": "c-1", "text": "shared",
                 "attachments": [], "reqId": "r-1" }""",
            Wire.notesAddMessage("a", "c-1", "shared", emptyList(), reqId = "r-1")
        )
        assertFrame(
            """{ "t": "notesEditMessage", "project": "a", "id": "m-1", "text": "edited" }""",
            Wire.notesEditMessage("a", "m-1", "edited")
        )
        assertFrame(
            """{ "t": "notesDeleteMessage", "project": "a", "id": "m-1" }""",
            Wire.notesDeleteMessage("a", "m-1")
        )
        assertFrame(
            """{ "t": "notesSearch", "project": "a", "query": "milk", "limit": 20 }""",
            Wire.notesSearch("a", "milk", 20)
        )
        assertFrame(
            """{ "t": "notesAttachment", "project": "a", "hash": "ab" }""",
            Wire.notesAttachment("a", "ab")
        )
    }
}
