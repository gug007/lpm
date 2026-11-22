package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UsageCardsTest {
    private fun snapshot(json: String) =
        LimitsSnapshot.parse(Json.parseToJsonElement(json).jsonObject)

    private val readings = snapshot(
        """
        {"claudeEnabled": true, "limits": {
          "claude:work": {"provider": "claude", "accountId": "work", "updatedAt": 2,
                          "fiveHour": {"usedPercent": 71.5, "resetsAt": 2000},
                          "weekly": {"usedPercent": 41.2, "resetsAt": 500}},
          "claude:default": {"provider": "claude", "accountId": "default", "updatedAt": 3},
          "claude:zed": {"provider": "claude", "accountId": "zed", "updatedAt": 1},
          "codex": {"provider": "codex", "updatedAt": 5},
          "codex:old": {"provider": "codex", "label": "stale", "updatedAt": 4}}}
        """
    )

    private val accounts = listOf(
        ClaudeAccountInfo("default", "Main login", null, true, "you@example.com", "max", true),
        ClaudeAccountInfo("work", "Work", "Work", true, "you@work.example", "max", true)
    )

    @Test
    fun `claude cards are titled by the Mac's names and sorted`() {
        val cards = claudeCards(readings, accounts)
        assertEquals(listOf("Claude", "Work", "zed"), cards.map { it.title })
        assertEquals(listOf("you@example.com", "you@work.example", null), cards.map { it.subtitle })
    }

    @Test
    fun `an account named on the Mac without an email shows its id`() {
        val named = listOf(ClaudeAccountInfo("work", "Work", "Work", true, "", "", false))
        assertEquals("work", claudeCards(readings, named).first { it.title == "Work" }.subtitle)
    }

    @Test
    fun `an account signed in as an earlier one says so, and that card names it`() {
        val shared = accounts + ClaudeAccountInfo(
            "zed",
            "Zed",
            "Zed",
            true,
            "you@example.com",
            "max",
            true,
            sameAs = "default"
        )
        val cards = claudeCards(readings, shared)
        val main = cards.first { it.account == "default" }
        assertEquals("you@example.com · also on Zed", main.subtitle)
        assertNull(main.sameAsTitle)
        assertEquals("Claude", cards.first { it.account == "zed" }.sameAsTitle)
    }

    @Test
    fun `claude reporting off shows no cards`() {
        val off = snapshot("""{"limits": {"claude:default": {"provider": "claude"}}}""")
        assertEquals(emptyList<UsageCard>(), claudeCards(off, accounts))
    }

    @Test
    fun `the freshest codex reading wins`() {
        assertEquals(5L, codexEntry(readings)?.updatedAt)
        assertNull(codexEntry(snapshot("""{"limits": {}}""")))
    }

    @Test
    fun `an account's use reads as one line, without windows that turned over`() {
        assertEquals("5h 72% · 7d 41%", claudeUsageLine(readings, "work", now = 100_000.0))
        assertEquals("5h 72%", claudeUsageLine(readings, "work", now = 1_000_000.0))
        assertNull(claudeUsageLine(readings, "work", now = 3_000_000.0))
        assertNull(claudeUsageLine(readings, "default", now = 0.0))
        assertNull(claudeUsageLine(null, "work", now = 0.0))
    }
}
