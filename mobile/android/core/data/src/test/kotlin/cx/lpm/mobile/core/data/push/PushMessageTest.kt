package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.model.string
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PushMessageTest {
    private val key = ByteArray(32) { it.toByte() }

    // Sealed the way the desktop's `seal_push` does: nonce(12) || ciphertext || tag(16).
    private val sealed =
        "AAECAwQFBgcICQoLPCClfreTp2nEJbWxk5oKG67npRjSCy0TUgKG8T9TIsF1f9yZybN99gCGU8/49UdSizoU" +
            "wTu0xrYdrQhKbIyHi5ZOqRSn8wpDaDXYCYr7LNIa/qwQGwo9CZHfsu4MlcvgopY4ioZ76lnyfUvWLVcNXc4C" +
            "EMaKq0T2BJt196CSQz+ZfiK1wLa/JnvDcoNquyW2X5qEFxkz5zmuZdlb2LmMl7GtvHaFnrkawlmp1+6i+62T" +
            "Ww2STb+EafTuMRHeUNo="

    private fun json(text: String) = Json.parseToJsonElement(text) as JsonObject

    @Test
    fun opensWhatTheMacSealed() {
        val payload = PushCrypto.open(sealed, key)
        assertEquals("storefront", payload?.string("project"))
        assertEquals("Waiting", payload?.string("status"))
    }

    @Test
    fun anythingElseIsDropped() {
        assertNull(PushCrypto.open(sealed, ByteArray(32)))
        assertNull(PushCrypto.open(sealed, ByteArray(16)))
        assertNull(PushCrypto.open("not base64!", key))
        assertNull(PushCrypto.open("AAECAw==", key))
        assertNull(PushCrypto.open(sealed.replaceRange(30, 31, "A"), key))
    }

    @Test
    fun anAgentAlertReadsLikeIos() {
        val alert = PushAlert.parse(PushCrypto.open(sealed, key)!!)!!
        assertEquals("Storefront", alert.title)
        assertEquals("Claude — Agent is waiting for you", alert.body)
        assertEquals(PushKind.Waiting, alert.kind)
        assertEquals("srv-1", alert.serverId)
        assertEquals("terminal", alert.target)
        assertEquals("t-1", alert.terminalId)
        assertEquals("claude:t-1", alert.statusKey)

        val bare = PushAlert.parse(json("""{"project":"api","status":"Done"}"""))!!
        assertEquals("api", bare.title)
        assertEquals("Agent finished", bare.body)
        assertEquals(PushKind.Done, bare.kind)
        assertNull(bare.serverId)
        assertEquals(
            PushKind.Error,
            PushAlert.parse(json("""{"project":"a","status":"Error"}"""))?.kind
        )
        assertNull(PushAlert.parse(json("""{"project":"","status":"Done"}""")))
    }

    @Test
    fun aFinishCarriesItsAnswerAndTheFilesItChanged() {
        val done = PushAlert.parse(
            json(
                """{"project":"api","status":"Done","summary":"Ship it?",""" +
                    """"answer":"Done.\n\n- **a.ts** fixed\n\nShip it?",""" +
                    """"changes":{"files":4,"added":52,"removed":5},""" +
                    """"files":[{"path":"lib/a.ts","added":40,"removed":3},{"path":""},""" +
                    """{"path":"README.md","added":2}]}"""
            )
        )!!
        assertEquals("Agent finished · 4 files, +52 −5", done.body)
        assertEquals("Ship it?", done.summary)
        assertEquals("Done.\n\n- **a.ts** fixed\n\nShip it?", done.answer)
        assertEquals(
            listOf(PushChangedFile("lib/a.ts", 40, 3), PushChangedFile("README.md", 2, 0)),
            done.files
        )
        assertEquals(4, done.changedFiles)
        assertEquals("a.ts", done.files[0].name)
        assertEquals("lib", done.files[0].directory)
        assertEquals("", done.files[1].directory)

        val older = PushAlert.parse(json("""{"project":"api","status":"Done","answer":" "}"""))!!
        assertNull(older.answer)
        assertEquals(emptyList<PushChangedFile>(), older.files)
        assertEquals(0, older.changedFiles)
    }

    @Test
    fun anAutomationAlertFallsInTheKindOfItsOutcome() {
        fun kind(status: String) = PushAlert.parse(
            json(
                """{"project":"api","target":"automation","terminal":"Nightly","status":"$status"}"""
            )
        )?.kind
        assertEquals(PushKind.AutomationStarted, kind("Automation started"))
        assertEquals(
            PushKind.AutomationStarted,
            kind("Automation found work — open lpm to start it")
        )
        assertEquals(PushKind.AutomationDone, kind("Automation finished · 3 fixed"))
        assertEquals(PushKind.AutomationError, kind("Automation failed"))
        assertEquals(PushKind.AutomationError, kind("Automation timed out"))
        assertEquals(
            "Nightly — Automation finished · 3 fixed",
            PushAlert.parse(
                json(
                    """{"project":"api","target":"automation","terminal":"Nightly",""" +
                        """"status":"Automation finished · 3 fixed"}"""
                )
            )?.body
        )
    }

    private fun answerable(actions: String, extra: String = """"ts":1792089000123,""") =
        PushAlert.parse(
            json(
                """{"serverId":"srv-1","project":"api","target":"terminal","terminal":"Claude",""" +
                    """"terminalId":"t-1","status":"Waiting","key":"claude_code_t-1",$extra""" +
                    """"actions":$actions}"""
            )
        )!!

    @Test
    fun theOfferedActionsPickTheButtons() {
        val permission = answerable("""["allow","deny"]""")
        assertEquals(listOf(AgentAnswerAction.Allow, AgentAnswerAction.Deny), permission.actions)
        assertEquals(1792089000123, permission.ts)
        assertEquals(listOf(AgentAnswerAction.Reply), answerable("""["reply"]""").actions)
        // Allow alone isn't a permission prompt's pair; unknown answers are skipped.
        assertEquals(emptyList<AgentAnswerAction>(), answerable("""["allow"]""").actions)
        assertEquals(
            listOf(AgentAnswerAction.Reply),
            answerable("""["approve","reply"]""").actions
        )
        assertEquals(emptyList<AgentAnswerAction>(), answerable("[]").actions)
        assertEquals(emptyList<AgentAnswerAction>(), answerable("""[1,"reply"]""").actions)
        assertEquals(emptyList<AgentAnswerAction>(), answerable("null").actions)
    }

    @Test
    fun anAlertWithoutItsReportOffersNothing() {
        // The Mac checks the report (key, terminal, ts) before typing anything in.
        assertEquals(
            emptyList<AgentAnswerAction>(),
            answerable("""["reply"]""", extra = "").actions
        )
        val automation = PushAlert.parse(
            json(
                """{"project":"api","target":"automation","automationId":"j1","terminalId":"t",""" +
                    """"key":"k","ts":1,"status":"Automation finished","actions":["reply"]}"""
            )
        )
        assertEquals(emptyList<AgentAnswerAction>(), automation?.actions)
        val noTerminal = PushAlert.parse(
            json("""{"project":"api","key":"k","ts":1,"status":"Done","actions":["reply"]}""")
        )
        assertEquals(emptyList<AgentAnswerAction>(), noTerminal?.actions)
    }

    @Test
    fun anAnswerNamesTheAlertsOwnReport() {
        val alert = answerable("""["allow","deny"]""")
        assertEquals(
            AgentAnswer(
                serverId = "srv-1",
                project = "api",
                terminalId = "t-1",
                key = "claude_code_t-1",
                ts = 1792089000123,
                action = AgentAnswerAction.Deny
            ),
            alert.answer(AgentAnswerAction.Deny)
        )
        assertNull(alert.answer(AgentAnswerAction.Reply, "hi"))
        assertEquals(
            "Ship it",
            answerable("""["reply"]""").answer(AgentAnswerAction.Reply, "Ship it")?.text
        )
    }

    @Test
    fun aWithdrawalNamesEntriesAndItsMac() {
        val clear = PushClear.parse(
            json(
                """{"serverId":"srv-1","clear":[{"project":"api","key":"k1"},""" +
                    """{"project":"web"},{"project":"web","key":"k2"}]}"""
            )
        )
        assertEquals("srv-1", clear?.serverId)
        assertEquals(
            setOf(StatusIdentity("api", "k1"), StatusIdentity("web", "k2")),
            clear?.entries
        )
        assertNull(PushClear.parse(json("""{"clear":[]}""")))
        assertNull(PushClear.parse(json("""{"project":"api"}""")))
    }
}
