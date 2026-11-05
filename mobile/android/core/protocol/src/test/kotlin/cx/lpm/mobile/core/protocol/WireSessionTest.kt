package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AgentDialog
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class WireSessionTest {
    @Test
    fun pairOmitsAnEmptyReplaces() {
        assertFrame(
            """{ "t": "pair", "code": "AB12-CD34", "name": "My Pixel", "phoneId": "p-1" }""",
            Wire.pair("AB12-CD34", "My Pixel", "p-1")
        )
        assertFrame(
            """{ "t": "pair", "code": "AB12-CD34", "name": "My Pixel", "phoneId": "p-1" }""",
            Wire.pair("AB12-CD34", "My Pixel", "p-1", replaces = "")
        )
        assertFrame(
            """{ "t": "pair", "code": "AB12-CD34", "name": "My Pixel", "phoneId": "p-1",
                 "replaces": "d-0" }""",
            Wire.pair("AB12-CD34", "My Pixel", "p-1", replaces = "d-0")
        )
        assertFrame(
            """{ "t": "pairRequest", "name": "My Pixel", "phoneId": "p-1" }""",
            Wire.pairRequest("My Pixel", "p-1", replaces = null)
        )
        assertFrame(
            """{ "t": "pairRequest", "name": "My Pixel", "phoneId": "p-1", "replaces": "d-0" }""",
            Wire.pairRequest("My Pixel", "p-1", "d-0")
        )
    }

    @Test
    fun signInCarriesThePhoneId() {
        assertFrame(
            """{ "t": "auth", "deviceId": "d-1", "token": "tok", "phoneId": "p-1" }""",
            Wire.auth("d-1", "tok", "p-1")
        )
        assertFrame(
            """{ "t": "relay", "deviceId": "d-1", "token": "tok", "slug": "box", "phoneId": "p-1" }""",
            Wire.relay("d-1", "tok", "box", "p-1")
        )
        assertFrame(
            """{ "t": "unpair", "deviceId": "d-1", "token": "tok", "phoneId": "p-1" }""",
            Wire.unpair("d-1", "tok", "p-1")
        )
        assertFrame("""{ "t": "ping" }""", Wire.ping())
        assertFrame("""{ "t": "presence", "active": false }""", Wire.presence(active = false))
    }

    @Test
    fun apnsTokenNestsTheToggles() {
        assertFrame(
            """{ "t": "apnsToken", "token": "ab", "env": "production", "key": "a2V5",
                 "notify": { "waiting": true, "done": false, "error": true, "automationStarted": false,
                             "automationDone": true, "automationError": true, "weeklyRecap": false,
                             "ci": true } }""",
            Wire.apnsToken(
                token = "ab",
                env = "production",
                key = "a2V5",
                notifyWaiting = true,
                notifyDone = false,
                notifyError = true,
                notifyAutomationStarted = false,
                notifyAutomationDone = true,
                notifyAutomationError = true,
                notifyWeeklyRecap = false,
                notifyCi = true
            )
        )
    }

    @Test
    fun pushTokenNamesItsPlatformAndLeavesOutAMissingEnv() {
        assertFrame(
            """{ "t": "pushToken", "platform": "fcm", "token": "f:A-b_1", "key": "a2V5",
                 "notify": { "waiting": true, "done": true, "error": false, "automationStarted": false,
                             "automationDone": true, "automationError": false, "weeklyRecap": true,
                             "ci": false } }""",
            Wire.pushToken(
                platform = "fcm",
                token = "f:A-b_1",
                env = null,
                key = "a2V5",
                notifyWaiting = true,
                notifyDone = true,
                notifyError = false,
                notifyAutomationStarted = false,
                notifyAutomationDone = true,
                notifyAutomationError = false,
                notifyWeeklyRecap = true,
                notifyCi = false
            )
        )
    }

    @Test
    fun answerAgentCarriesTheAlertsReportAndAReplysText() {
        assertFrame(
            """{ "t": "answerAgent", "project": "api", "terminalId": "t-1",
                 "key": "claude_code_t-1", "ts": 1792089000123, "action": "allow", "reqId": "r-1" }""",
            Wire.answerAgent("api", "t-1", "claude_code_t-1", 1792089000123, "allow", null, "r-1")
        )
        assertFrame(
            """{ "t": "answerAgent", "project": "api", "terminalId": "t-1", "key": "k", "ts": 5,
                 "action": "reply", "text": "Ship it", "reqId": "r-2" }""",
            Wire.answerAgent("api", "t-1", "k", 5, "reply", "Ship it", "r-2")
        )
    }

    @Test
    fun agentDialogAsksForATerminalsDialogAndPicksFromIt() {
        assertFrame(
            """{ "t": "agentDialog", "project": "api", "terminalId": "t-1" }""",
            Wire.agentDialog("api", "t-1")
        )
        val dialog = AgentDialog(
            id = "0123456789abcdef",
            question = "Run it?",
            details = emptyList(),
            options = listOf(
                AgentDialogOption("1", "Yes", "", typed = false),
                AgentDialogOption("2", "No", "", typed = false)
            )
        )
        val read = AgentDialogRead("api", "t-1", "claude_code_t-1", 1792089000123, dialog)
        assertFrame(
            """{ "t": "answerAgent", "project": "api", "terminalId": "t-1", "key": "claude_code_t-1",
                 "ts": 1792089000123, "action": "pick", "option": "2", "dialog": "0123456789abcdef",
                 "reqId": "r-3" }""",
            Wire.pickAgentDialog(read, "2", "r-3")
        )
    }

    @Test
    fun liveActivityNamesNoTokenFromAnFcmPhone() {
        assertFrame("""{ "t": "liveActivity", "on": true }""", Wire.liveActivity(on = true))
        assertFrame("""{ "t": "liveActivity", "on": false }""", Wire.liveActivity(on = false))
    }

    @Test
    fun macRequests() {
        assertFrame("""{ "t": "machines" }""", Wire.machines())
        assertFrame("""{ "t": "machinePair", "slug": "box" }""", Wire.machinePair("box"))
        assertFrame("""{ "t": "stats", "days": 30 }""", Wire.stats(30))
        assertFrame("""{ "t": "limits" }""", Wire.limits())
        assertFrame(
            """{ "t": "ttsSpeak", "reqId": "r", "text": "Hello" }""",
            Wire.ttsSpeak("r", "Hello")
        )
    }

    @Test
    fun updateCheckSendsForceOnlyWhenSet() {
        assertFrame("""{ "t": "updateCheck" }""", Wire.updateCheck())
        assertFrame("""{ "t": "updateCheck", "force": true }""", Wire.updateCheck(force = true))
        assertFrame("""{ "t": "updateInstall" }""", Wire.updateInstall())
        assertFrame("""{ "t": "updateCancel" }""", Wire.updateCancel())
    }

    @Test
    fun framesAreCompactAndEscaped() {
        val text = Wire.input("t-1", "echo \"hi\"\n")
        assertFalse(text.contains(": "))
        assertFrame("""{ "t": "in", "id": "t-1", "d": "echo \"hi\"\n" }""", text)
        assertEquals("""{"t":"ping"}""", Wire.ping())
        assertEquals("""{"a":1}""", Wire.json(buildJsonObject { put("a", 1) }))
    }

    @Test
    fun helpers() {
        assertEquals("\u0000HEX:00ff7f80", Wire.hexFrame(byteArrayOf(0, -1, 127, -128)))
        assertEquals("\u0000HEX:", Wire.hexFrame(ByteArray(0)))
        val obj = Json.parseToJsonElement("""{ "label": "", "id": "t-3", "n": 7 }""").jsonObject
        assertEquals("t-3", Wire.label(obj, fallback = "id"))
        assertEquals("7", Wire.reqIdString(obj["n"]))
        assertEquals("", Wire.reqIdString(null))
    }

    @Test
    fun slugify() {
        assertEquals("auth-refactor-v2", Wire.slugify("  Auth Refactor — v2!! "))
        assertEquals("n-c-d", Wire.slugify("Ünïcødé ✨"))
        assertEquals("", Wire.slugify("✨ — ✨"))
        assertEquals(64, Wire.slugify("a".repeat(80)).length)
        assertEquals("hello-world", Wire.slugify("--Hello__World--"))
    }
}
