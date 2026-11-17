package cx.lpm.mobile.feature.usage.rows

import cx.lpm.mobile.core.model.AgentStats
import cx.lpm.mobile.core.model.ClaudeAccountInfo
import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.LimitsSnapshot
import cx.lpm.mobile.core.model.ProviderLimits
import cx.lpm.mobile.core.model.UsageBreakdown
import cx.lpm.mobile.core.model.UsageTokens
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageRowsTest {
    private val now = 1_792_065_600_000.0
    private val hour = 3_600_000.0

    private fun window(used: Double, resetsIn: Double) =
        LimitWindow(used, ((now + resetsIn) / 1000).toLong())

    private fun claude(
        account: String,
        weekly: LimitWindow?,
        fiveHour: LimitWindow?,
        age: Double = 0.0
    ) = ProviderLimits("claude", account, null, fiveHour, weekly, (now - age).toLong())

    private fun account(id: String, name: String?, email: String = "") =
        ClaudeAccountInfo(id, name ?: id, name, true, email, "max", true)

    /** The demo Mac: two accounts that reported, three that haven't yet, and Codex. */
    private val demo = LimitsSnapshot(
        entries = mapOf(
            "claude:default" to claude("default", window(27.0, 96 * hour), window(62.0, 3 * hour)),
            "claude:work" to
                claude("work", window(11.0, 106 * hour), window(34.0, 2 * hour + 600_000)),
            "codex" to ProviderLimits(
                "codex",
                null,
                "pro",
                window(19.0, 4 * hour),
                window(96.0, 58 * hour),
                now.toLong()
            )
        ),
        claudeEnabled = true,
        nowMs = now
    )
    private val accounts = listOf(
        account("default", null, "you@example.com"),
        account("work", "Work", "you@work.example"),
        account("personal", "Personal"),
        account("client", "Client"),
        account("laptop", "Old laptop")
    )

    private fun spend(provider: String, tokens: Long, sessions: Int) = AgentStats(
        generatedAt = 0,
        days = 1,
        sessions = sessions,
        totals = UsageTokens(0, 0, 0, 0, 0, 0, 0, tokens),
        providers = listOf(
            UsageBreakdown(
                provider,
                provider,
                sessions,
                UsageTokens(0, 0, 0, 0, 0, 0, 0, tokens),
                null,
                false
            )
        ),
        projects = emptyList(),
        models = emptyList(),
        daily = emptyList(),
        recentSessions = emptyList(),
        sources = emptyList()
    )

    @Test
    fun `one row per account, the added ones first, then the main login and Codex`() {
        val rows = usageRows(demo, null, accounts, now, now)
        assertEquals(
            listOf("Work", "Personal", "Client", "Old laptop", "Claude", "Codex"),
            rows.map { it.label }
        )
        assertEquals("claude:work", rows[0].id)
        assertEquals("work", rows[0].account)
        assertNull(rows[5].account)
        assertEquals("you@work.example", rows[0].subtitle)
    }

    @Test
    fun `an account row shows its weekly window over the 5-hour lane`() {
        val work = usageRows(demo, null, accounts, now, now).first()
        assertTrue(work.windowed)
        assertEquals("4d 10h", work.detail)
        assertEquals("11%", work.percentText)
        assertEquals("weekly", work.windowLabel)
        assertEquals("", work.windowShort)
        assertEquals(0.11, work.fraction, 1e-9)
        assertEquals(0.34, work.lane!!.fraction, 1e-9)
        assertEquals(62.0 / 168, work.pace!!, 1e-9)
        assertEquals("5-hour 34% used", work.laneText)
    }

    @Test
    fun `an account that hasn't run yet keeps its row, empty`() {
        val personal = usageRows(demo, null, accounts, now, now)[1]
        assertFalse(personal.windowed)
        assertEquals("—", personal.detail)
        assertEquals("", personal.percentText)
        assertEquals(UsageLane.Empty, personal.lane)
        assertNull(personal.pace)
        assertNull(personal.data)
    }

    @Test
    fun `a window past its reset gives way to the 5-hour one`() {
        val snapshot = LimitsSnapshot(
            mapOf("claude:default" to claude("default", window(90.0, -hour), window(40.0, hour))),
            claudeEnabled = true,
            nowMs = null
        )
        val row = usageRows(snapshot, null, emptyList(), now, now).single()
        assertEquals("Claude", row.label)
        assertEquals("claude:default", row.id)
        assertEquals("5h", row.windowShort)
        assertEquals("5-hour", row.windowLabel)
        assertEquals("1h", row.detail)
        assertEquals(UsageLane.Empty, row.lane)
    }

    @Test
    fun `a plan without a 5-hour window draws its weekly one alone`() {
        val weeklyOnly = claude("default", window(60.0, 64 * hour), null).copy(noFiveHour = true)
        val snapshot = LimitsSnapshot(
            mapOf("claude:default" to weeklyOnly),
            claudeEnabled = true,
            nowMs = null
        )
        val row = usageRows(snapshot, null, emptyList(), now, now).single()
        assertEquals("weekly", row.windowLabel)
        assertEquals("60%", row.percentText)
        assertNull(row.lane)
        assertEquals("", row.laneText)
        assertTrue(row.pace != null)
    }

    @Test
    fun `a lone tool with no window shows today's spend instead`() {
        val rows = usageRows(null, spend("codex", 1_234_000, 3), emptyList(), now, now)
        val codex = rows.single()
        assertEquals("codex", codex.id)
        assertEquals("1.2M today", codex.detail)
        assertNull(codex.lane)
        assertEquals(1.0, codex.fraction, 0.0)
        assertEquals("1.2M spent today · 3 sessions", codex.spentLine)
    }

    @Test
    fun `a tool with nothing at all has no row, a removed account is dropped`() {
        assertEquals(emptyList<UsageRow>(), usageRows(null, null, emptyList(), now, now))
        val stray = LimitsSnapshot(
            mapOf("claude:gone" to claude("gone", window(5.0, hour), null)),
            claudeEnabled = true,
            nowMs = null
        )
        assertEquals(emptyList<UsageRow>(), usageRows(stray, null, emptyList(), now, now))
    }

    @Test
    fun `a reading the Mac stamped over 15 minutes ago is stale`() {
        val old = LimitsSnapshot(
            mapOf(
                "claude:default" to
                    claude("default", window(5.0, 96 * hour), null, age = 16 * 60_000.0)
            ),
            claudeEnabled = true,
            nowMs = null
        )
        assertTrue(usageRows(old, null, emptyList(), now, now).single().stale)
        assertFalse(usageRows(old, null, emptyList(), now, now - 2 * 60_000).single().stale)
    }
}
