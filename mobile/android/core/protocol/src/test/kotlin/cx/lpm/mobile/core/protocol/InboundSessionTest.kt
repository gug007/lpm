package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AgentDialog
import cx.lpm.mobile.core.model.AgentDialogOption
import cx.lpm.mobile.core.model.AgentDialogRead
import cx.lpm.mobile.core.model.MacBuild
import cx.lpm.mobile.core.model.MacUpdateStep
import cx.lpm.mobile.core.model.USAGE_GENERIC_ERROR
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class InboundSessionTest {
    @Test
    fun paired() {
        val f = decode<Inbound.Paired>(
            """{ "t": "paired", "deviceId": "d-1", "token": "tok", "serverId": "s-1",
                 "serverName": "My MacBook Pro", "platform": "macos",
                 "hosts": ["192.168.1.23", "100.101.102.103"], "version": "0.6.12", "selfUpdate": true,
                 "features": ["fileUpload", "fileUpload"] }"""
        )
        assertEquals("d-1", f.deviceId)
        assertEquals("tok", f.token)
        assertEquals("My MacBook Pro", f.serverName)
        assertEquals(listOf("192.168.1.23", "100.101.102.103"), f.hosts)
        assertEquals("macos", f.platform)
        assertEquals(MacBuild("0.6.12", selfUpdate = true), f.build)
        assertEquals(setOf("fileUpload"), f.features)
    }

    @Test
    fun pairedFromAnOlderMacKeepsPlatformUnset() {
        val f = decode<Inbound.Paired>("""{ "t": "paired", "deviceId": "d", "token": "t" }""")
        assertNull(f.serverId)
        assertNull(f.platform)
        assertNull(f.build)
        assertTrue(f.hosts.isEmpty())
        assertTrue(f.features.isEmpty())
    }

    @Test
    fun pairPendingAndDenied() {
        assertEquals(
            "1234",
            decode<Inbound.PairPending>("""{ "t": "pairPending", "matchCode": "1234" }""").matchCode
        )
        assertEquals(
            Inbound.PairDenied("busy", null),
            decode<Inbound.PairDenied>("""{ "t": "pairDenied", "reason": "busy" }""")
        )
        assertEquals(
            Inbound.PairDenied("declined", "No display"),
            decode<Inbound.PairDenied>(
                """{ "t": "pairDenied", "reason": "declined", "message": "No display" }"""
            )
        )
        assertEquals("declined", decode<Inbound.PairDenied>("""{ "t": "pairDenied" }""").reason)
    }

    @Test
    fun ready() {
        val f = decode<Inbound.Ready>(
            """{ "t": "ready", "serverId": "s-1", "serverName": "Build Box", "platform": "linux",
                 "hosts": ["10.0.0.4"], "version": "0.7.0", "features": ["fileUpload"] }"""
        )
        assertEquals("linux", f.platform)
        assertEquals(MacBuild("0.7.0", selfUpdate = false), f.build)
        assertEquals(setOf("fileUpload"), f.features)
        assertNull(decode<Inbound.Ready>("""{ "t": "ready", "version": "" }""").build)
    }

    @Test
    fun byeAndError() {
        assertEquals(
            Inbound.Bye("sleep", 1_760_000_000_000),
            decode<Inbound.Bye>("""{ "t": "bye", "reason": "sleep", "at": 1760000000000 }""")
        )
        assertEquals(Inbound.Bye("", null), decode<Inbound.Bye>("""{ "t": "bye" }"""))
        assertEquals(
            "unauthorized",
            decode<Inbound.Error>("""{ "t": "error", "error": "unauthorized" }""").message
        )
        assertEquals("error", decode<Inbound.Error>("""{ "t": "error" }""").message)
    }

    @Test
    fun pongAndApnsToken() {
        assertSame(Inbound.Pong, Inbound.parse("""{ "t": "pong" }"""))
        assertTrue(decode<Inbound.ApnsToken>("""{ "t": "apnsToken", "ok": true }""").ok)
        assertFalse(
            decode<Inbound.ApnsToken>("""{ "t": "apnsToken", "ok": false, "error": "…" }""").ok
        )
        assertTrue(decode<Inbound.PushToken>("""{ "t": "pushToken", "ok": true }""").ok)
        assertFalse(
            decode<Inbound.PushToken>("""{ "t": "pushToken", "ok": false, "error": "…" }""").ok
        )
    }

    @Test
    fun answerAgentMatchesItsRequestAndSaysWhyItFailed() {
        assertEquals(
            Inbound.AnswerAgent(reqId = "r-1", error = null),
            decode<Inbound.AnswerAgent>("""{ "t": "answerAgent", "ok": true, "reqId": "r-1" }""")
        )
        assertEquals(
            Inbound.AnswerAgent(reqId = "7", error = "This prompt was already answered."),
            decode<Inbound.AnswerAgent>(
                """{ "t": "answerAgent", "ok": false, "error": "This prompt was already answered.",
                     "reqId": 7 }"""
            )
        )
        assertEquals(
            Inbound.AnswerAgent(reqId = "", error = "The Mac couldn't send it."),
            decode<Inbound.AnswerAgent>("""{ "t": "answerAgent", "ok": false }""")
        )
        assertTrue(decode<Inbound.LiveActivity>("""{ "t": "liveActivity", "ok": true }""").ok)
        assertFalse(decode<Inbound.LiveActivity>("""{ "t": "liveActivity", "ok": false }""").ok)
    }

    @Test
    fun agentDialogReadsTheWaitingReportAndItsChoices() {
        val read = decode<Inbound.AgentDialog>(
            """{ "t": "agentDialog", "project": "api", "terminalId": "t-1", "key": "claude_code_t-1",
                 "ts": 1792089000123, "dialog": { "id": "0123456789abcdef", "question": "Run it?",
                 "details": ["npm test", "in api/"],
                 "options": [ { "key": "1", "label": "Yes", "description": "Run once", "typed": false },
                              { "key": "", "label": "Dropped" },
                              { "key": "2", "label": "Tell Claude what to do", "typed": true } ] } }"""
        ).read
        assertEquals(
            AgentDialogRead(
                project = "api",
                terminalId = "t-1",
                key = "claude_code_t-1",
                ts = 1792089000123,
                dialog = AgentDialog(
                    id = "0123456789abcdef",
                    question = "Run it?",
                    details = listOf("npm test", "in api/"),
                    options = listOf(
                        AgentDialogOption("1", "Yes", "Run once", typed = false),
                        AgentDialogOption("2", "Tell Claude what to do", "", typed = true)
                    )
                )
            ),
            read
        )
    }

    @Test
    fun agentDialogWithNothingToPickReadsAsNone() {
        val idle = decode<Inbound.AgentDialog>(
            """{ "t": "agentDialog", "project": "api", "terminalId": "t-1", "dialog": null }"""
        ).read
        assertEquals(AgentDialogRead("api", "t-1", "", 0, null), idle)
        for (dialog in listOf(
            """{ "question": "No id", "options": [ { "key": "1" }, { "key": "2" } ] }""",
            """{ "id": "", "options": [ { "key": "1" }, { "key": "2" } ] }""",
            """{ "id": "a", "options": [ { "key": "1", "label": "Only one" } ] }"""
        )) {
            val read = decode<Inbound.AgentDialog>(
                """{ "t": "agentDialog", "project": "api", "terminalId": "t-1", "key": "k", "ts": 5,
                     "dialog": $dialog }"""
            ).read
            assertEquals("k", read.key)
            assertNull(dialog, read.dialog)
        }
    }

    @Test
    fun stats() {
        val ok = decode<Inbound.Stats>(
            """{ "t": "stats", "ok": true, "stats": { "generatedAt": 1760000000000, "days": 7, "sessions": 3,
                 "totals": { "inputTokens": 4200000000, "totalTokens": 4200000100 } } }"""
        )
        assertEquals(4_200_000_000L, ok.stats!!.totals.inputTokens)
        assertNull(ok.error)
        val day = decode<Inbound.Stats>(
            """{ "t": "stats", "ok": true, "stats": { "days": 30, "daily": [ { "date": "2026-10-18",
                 "claudeTokens": 5, "codexTokens": 0, "totalTokens": 5, "models": [ { "provider": "claude",
                 "model": "claude-haiku-5-5", "tokens": { "outputTokens": 5 }, "longContext": true } ] } ] } }"""
        ).stats!!.daily.single()
        assertEquals("claude-haiku-5-5", day.models.single().model)
        assertEquals(5L, day.models.single().tokens.outputTokens)
        assertTrue(day.models.single().longContext)
        assertFalse(day.models.single().fast)
        assertEquals(0, decode<Inbound.Stats>("""{ "t": "stats", "ok": true }""").stats!!.days)
        assertEquals(
            Inbound.Stats(null, "Couldn't load stats."),
            decode<Inbound.Stats>("""{ "t": "stats" }""")
        )
        assertEquals(
            "scan failed",
            decode<Inbound.Stats>("""{ "t": "stats", "ok": false, "error": "scan failed" }""").error
        )
    }

    @Test
    fun limits() {
        val ok = decode<Inbound.Limits>(
            """{ "t": "limits", "ok": true, "claudeEnabled": true, "now": 1760000000000,
                 "limits": { "codex": { "provider": "codex", "label": "pro",
                   "fiveHour": { "usedPercent": 12, "resetsAt": 1760003600 }, "updatedAt": 1759999999000 } } }"""
        )
        assertEquals(12.0, ok.snapshot!!.entries.getValue("codex").fiveHour!!.usedPercent, 0.0)
        assertEquals(
            Inbound.Limits(null, USAGE_GENERIC_ERROR),
            decode<Inbound.Limits>("""{ "t": "limits", "ok": false }""")
        )
    }

    @Test
    fun limitsChangedCarriesTheWholeSnapshot() {
        val f = decode<Inbound.LimitsChanged>(
            """{ "t": "limits-changed", "claudeEnabled": false, "now": 1760000000000,
                 "limits": { "claude:work": { "provider": "claude", "accountId": "work", "updatedAt": 1 } } }"""
        )
        assertEquals("work", f.snapshot.entries.getValue("claude:work").accountId)
        assertFalse(f.snapshot.claudeEnabled)
    }

    @Test
    fun ttsSpeak() {
        assertEquals(
            Inbound.TtsSpeak("r1", "AAAA", null),
            decode<Inbound.TtsSpeak>(
                """{ "t": "ttsSpeak", "reqId": "r1", "ok": true, "format": "aac", "audio": "AAAA" }"""
            )
        )
        assertEquals(
            Inbound.TtsSpeak("r1", null, "Couldn't synthesize speech."),
            decode<Inbound.TtsSpeak>("""{ "t": "ttsSpeak", "reqId": "r1", "audio": "AAAA" }""")
        )
    }

    @Test
    fun machines() {
        val f = decode<Inbound.Machines>(
            """{ "t": "machines", "machines": [{ "slug": "box", "name": "Build Box", "platform": "linux",
                 "serverId": "", "state": "ready", "relay": true, "projects": [{ "name": "api" }] }] }"""
        )
        val box = f.machines.single()
        assertEquals("box", box.id)
        assertNull(box.serverId)
        assertTrue(box.relay)
        assertEquals("api", box.projects!!.single().name)
    }

    @Test
    fun machinePair() {
        val ok = decode<Inbound.MachinePair>(
            """{ "t": "machinePair", "slug": "box", "ok": true, "code": "AB12-CD34", "hosts": ["10.0.0.4"],
                 "port": 8766, "fingerprint": "ab12", "serverId": "s-2", "name": "Build Box", "platform": "linux" }"""
        )
        assertEquals(8766, ok.offer!!.port)
        assertEquals("AB12-CD34", ok.offer.code)
        val failed =
            decode<Inbound.MachinePair>(
                """{ "t": "machinePair", "slug": "box", "ok": false, "error": "offline" }"""
            )
        assertEquals(Inbound.MachinePair("box", null, "offline"), failed)
        assertEquals(
            "Couldn't get a pairing code.",
            decode<Inbound.MachinePair>("""{ "t": "machinePair" }""").error
        )
    }

    @Test
    fun updateFrames() {
        val check = decode<Inbound.UpdateCheck>(
            """{ "t": "updateCheck", "ok": true, "currentVersion": "0.6.10", "latestVersion": "0.6.12",
                 "updateAvail": true, "phase": "idle", "progress": -1 }"""
        ).check
        assertTrue(check.updateAvailable)
        assertEquals("0.6.12", check.latestVersion)
        assertNull(check.error)
        assertEquals(
            MacUpdateStep(MacUpdateStep.Phase.Downloading, 42),
            decode<Inbound.UpdateProgress>(
                """{ "t": "updateProgress", "phase": "downloading", "progress": 42 }"""
            ).step
        )
        assertEquals(
            Inbound.UpdateInstall(cancelled = true, error = null),
            decode<Inbound.UpdateInstall>(
                """{ "t": "updateInstall", "ok": true, "cancelled": true }"""
            )
        )
        assertEquals(
            Inbound.UpdateInstall(cancelled = false, error = "The update didn't start."),
            decode<Inbound.UpdateInstall>("""{ "t": "updateInstall", "ok": false }""")
        )
        assertTrue(
            decode<Inbound.UpdateCancel>(
                """{ "t": "updateCancel", "ok": true, "stopping": true }"""
            ).stopping
        )
        assertFalse(decode<Inbound.UpdateCancel>("""{ "t": "updateCancel" }""").stopping)
    }
}
