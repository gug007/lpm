package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.RecapDay
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapTime
import cx.lpm.mobile.core.model.WeeklyRecap
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WeeklyRecapFrameTest {
    @Test
    fun requestSendsFreshOnlyWhenSet() {
        assertFrame("""{ "t": "weeklyRecap", "week": "last" }""", Wire.weeklyRecap("last"))
        assertFrame(
            """{ "t": "weeklyRecap", "week": "this", "fresh": true }""",
            Wire.weeklyRecap("this", fresh = true)
        )
        assertFrame(
            """{ "t": "weeklyRecap", "week": "last", "period": "month" }""",
            Wire.weeklyRecap("last", "month")
        )
    }

    @Test
    fun decodesAMonth() {
        val f = decode<Inbound.WeeklyRecap>(
            """{ "t": "weeklyRecap", "ok": true, "week": "last", "period": "month",
                 "recap": { "week": "2026-09-01", "period": "month" } }"""
        )
        assertEquals("month", f.period)
        assertEquals(RecapPeriod.Month, f.recap?.period)
        assertEquals(
            "week",
            decode<Inbound.WeeklyRecap>("""{ "t": "weeklyRecap", "ok": true }""").period
        )
    }

    @Test
    fun decodesTheWholeRecap() {
        val f = decode<Inbound.WeeklyRecap>(
            """{ "t": "weeklyRecap", "ok": true, "week": "last", "recap": { "week": "2026-10-05",
                 "days": [ { "date": "2026-10-05", "agentMs": 21120000, "prompts": 38 } ],
                 "previousAgentMs": 87600000, "sessions": 58,
                 "projects": [ { "name": "saas-app", "agentMs": 46248000 } ],
                 "agents": [ { "name": "claude", "agentMs": 72192000 } ],
                 "workedRepos": ["github.com/acme/saas-app"],
                 "linesAdded": 6120, "linesRemoved": 2407, "missing": ["build-box"] } }"""
        )
        assertEquals("last", f.week)
        assertEquals(RecapPeriod.Week, f.recap?.period)
        assertNull(f.error)
        assertEquals(
            WeeklyRecap(
                week = "2026-10-05",
                days = listOf(RecapDay("2026-10-05", 21_120_000, 38)),
                previousAgentMs = 87_600_000,
                sessions = 58,
                projects = listOf(RecapTime("saas-app", 46_248_000)),
                agents = listOf(RecapTime("claude", 72_192_000)),
                workedRepos = listOf("github.com/acme/saas-app"),
                linesAdded = 6_120,
                linesRemoved = 2_407,
                missing = listOf("build-box")
            ),
            f.recap
        )
    }

    @Test
    fun anOlderMacsMissingFieldsReadAsEmpty() {
        val recap = decode<Inbound.WeeklyRecap>(
            """{ "t": "weeklyRecap", "ok": true, "week": "this", "recap": { "days": [ {} ] } }"""
        ).recap!!
        assertEquals(listOf(RecapDay("", 0, 0)), recap.days)
        assertEquals(0L, recap.sessions)
        assertEquals(emptyList<String>(), recap.workedRepos)
        assertEquals(emptyList<String>(), recap.missing)
        assertEquals(
            "",
            decode<Inbound.WeeklyRecap>("""{ "t": "weeklyRecap", "ok": true }""").recap!!.week
        )
    }

    @Test
    fun failureCarriesTheWeekAndWhy() {
        assertEquals(
            Inbound.WeeklyRecap("this", "week", null, "history unreadable"),
            decode<Inbound.WeeklyRecap>(
                """{ "t": "weeklyRecap", "ok": false, "week": "this", "error": "history unreadable" }"""
            )
        )
        assertEquals(
            Inbound.WeeklyRecap("", "week", null, "Couldn't read the week."),
            decode<Inbound.WeeklyRecap>("""{ "t": "weeklyRecap" }""")
        )
    }
}
