package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AgentLaunch
import org.junit.Test

class WireTerminalsTest {
    @Test
    fun terminalStreams() {
        assertFrame("""{ "t": "terminals", "project": "api" }""", Wire.terminals("api"))
        assertFrame("""{ "t": "sub", "id": "api-1" }""", Wire.sub("api-1"))
        assertFrame(
            """{ "t": "sub", "id": "api-1", "from": 5000000000 }""",
            Wire.sub("api-1", from = 5_000_000_000)
        )
        assertFrame("""{ "t": "sub", "id": "api-1", "from": 0 }""", Wire.sub("api-1", from = 0))
        assertFrame("""{ "t": "unsub", "id": "api-1" }""", Wire.unsub("api-1"))
        assertFrame("""{ "t": "claim", "id": "api-1" }""", Wire.claim("api-1"))
        assertFrame("""{ "t": "in", "id": "api-1", "d": "ls\r" }""", Wire.input("api-1", "ls\r"))
        assertFrame(
            """{ "t": "resize", "id": "api-1", "cols": 120, "rows": 40 }""",
            Wire.resize("api-1", 120, 40)
        )
    }

    @Test
    fun terminalTabs() {
        assertFrame("""{ "t": "newTerminal", "project": "api" }""", Wire.newTerminal("api"))
        assertFrame(
            """{ "t": "closeTerminal", "project": "api", "id": "api-2" }""",
            Wire.closeTerminal("api", "api-2")
        )
        assertFrame(
            """{ "t": "renameTerminal", "project": "api", "id": "api-2", "label": "Logs" }""",
            Wire.renameTerminal("api", "api-2", "Logs")
        )
        assertFrame(
            """{ "t": "pinTerminal", "project": "api", "id": "api-2" }""",
            Wire.pinTerminal("api", "api-2")
        )
        assertFrame(
            """{ "t": "restartTerminal", "project": "api", "id": "api-2" }""",
            Wire.restartTerminal("api", "api-2")
        )
        assertFrame(
            """{ "t": "reorderTerminals", "project": "api", "order": ["api-2", "api-1"] }""",
            Wire.reorderTerminals("api", listOf("api-2", "api-1"))
        )
    }

    @Test
    fun runActionAlwaysSendsInputsAndConfirmation() {
        assertFrame(
            """{ "t": "runAction", "project": "api", "action": "deploy", "inputValues": {}, "confirmed": false }""",
            Wire.runAction("api", "deploy")
        )
        assertFrame(
            """{ "t": "runAction", "project": "api", "action": "deploy:prod", "inputValues": { "tag": "v1" }, "confirmed": true }""",
            Wire.runAction("api", "deploy:prod", mapOf("tag" to "v1"), confirmed = true)
        )
        assertFrame(
            """{ "t": "runAction", "project": "api", "action": "claude", "inputValues": {}, "confirmed": true, "prompt": "Fix it" }""",
            Wire.runAction("api", "claude", confirmed = true, prompt = "Fix it")
        )
    }

    @Test
    fun backgroundRuns() {
        assertFrame(
            """{ "t": "runActionBackground", "project": "api", "action": "seed", "inputValues": {}, "runId": "r-1" }""",
            Wire.runActionBackground("api", "seed", emptyMap(), "r-1")
        )
        assertFrame(
            """{ "t": "actionPopup", "project": "api", "action": "deploy:stars" }""",
            Wire.actionPopup("api", "deploy:stars", fresh = false)
        )
        assertFrame(
            """{ "t": "actionPopup", "project": "api", "action": "stars", "fresh": true }""",
            Wire.actionPopup("api", "stars", fresh = true)
        )
        assertFrame(
            """{ "t": "actionBgOutput", "project": "api", "runId": "r-1" }""",
            Wire.actionBgOutput("api", "r-1")
        )
        assertFrame(
            """{ "t": "cancelActionBackground", "runId": "r-1" }""",
            Wire.cancelActionBackground("r-1")
        )
        assertFrame("""{ "t": "backgroundRuns", "project": "api" }""", Wire.backgroundRuns("api"))
    }

    @Test
    fun uploadOmitsAnEmptyName() {
        assertFrame(
            """{ "t": "upload", "id": "api-1", "data": "aGk=", "mime": "image/jpeg", "reqId": "q" }""",
            Wire.upload("api-1", "aGk=", "image/jpeg", name = null, reqId = "q")
        )
        assertFrame(
            """{ "t": "upload", "id": "api-1", "data": "aGk=", "mime": "image/jpeg", "reqId": "q" }""",
            Wire.upload("api-1", "aGk=", "image/jpeg", name = "", reqId = "q")
        )
        assertFrame(
            """{ "t": "upload", "id": "api-1", "data": "aGk=", "mime": "application/pdf", "name": "spec.pdf", "reqId": "q" }""",
            Wire.upload("api-1", "aGk=", "application/pdf", name = "spec.pdf", reqId = "q")
        )
    }

    @Test
    fun chunkedUpload() {
        assertFrame(
            """{ "t": "uploadBegin", "id": "api-1", "name": "clip.mov", "bytes": 3000000000, "reqId": "q1" }""",
            Wire.uploadBegin("api-1", "clip.mov", 3_000_000_000, "q1")
        )
        assertFrame(
            """{ "t": "uploadChunk", "id": "api-1", "uploadId": "u-1", "offset": 1048576, "b64": "aGk=", "reqId": "q2" }""",
            Wire.uploadChunk("api-1", "u-1", 1_048_576, "aGk=", "q2")
        )
        assertFrame(
            """{ "t": "uploadDone", "id": "api-1", "uploadId": "u-1", "reqId": "q3" }""",
            Wire.uploadDone("api-1", "u-1", "q3")
        )
        assertFrame(
            """{ "t": "uploadAbort", "id": "api-1", "uploadId": "u-1" }""",
            Wire.uploadAbort("api-1", "u-1")
        )
    }

    @Test
    fun fileChunk() {
        assertFrame(
            """{ "t": "fileChunk", "reqId": "f-1", "project": "api", "path": "README.md", "offset": 262144, "length": 262144 }""",
            Wire.fileChunk("f-1", "api", "README.md", 262_144, 262_144)
        )
    }

    @Test
    fun newTerminalWithAnAgent() {
        assertFrame(
            """{ "t": "newTerminal", "project": "api", "agent": "claude", "model": "opus", "effort": "high", "prompt": "Fix the failing test" }""",
            Wire.newTerminal("api", AgentLaunch("claude", "opus", "high", "Fix the failing test"))
        )
        assertFrame(
            """{ "t": "newTerminal", "project": "api", "agent": "gemini" }""",
            Wire.newTerminal("api", AgentLaunch(agent = "gemini"))
        )
        // A shell sends no agent fields, whatever else the launch holds.
        assertFrame(
            """{ "t": "newTerminal", "project": "api" }""",
            Wire.newTerminal("api", AgentLaunch(model = "opus", prompt = "hi"))
        )
    }

    @Test
    fun agentSessionsAndFiles() {
        assertFrame("""{ "t": "agentOptions" }""", Wire.agentOptions())
        assertFrame(
            """{ "t": "agentSessions", "project": "api", "search": "", "limit": 40 }""",
            Wire.agentSessions("api", "", 40)
        )
        assertFrame(
            """{ "t": "resumeSession", "project": "api", "provider": "claude", "sessionId": "4f1c", "title": "Fix checkout tax rounding" }""",
            Wire.resumeSession("api", "claude", "4f1c", "Fix checkout tax rounding")
        )
        assertFrame(
            """{ "t": "listDir", "project": "api", "dir": "src/app" }""",
            Wire.listDir("api", "src/app")
        )
    }
}
