package cx.lpm.mobile.feature.automations.format

import cx.lpm.mobile.feature.automations.entry
import cx.lpm.mobile.feature.automations.job
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AutomationFormatTest {
    private val now = Instant.parse("2026-10-16T02:20:00Z")
    private val clock = AutomationClock(now, ZoneOffset.UTC, Locale.US)
    private val t = now.epochSecond

    @Test
    fun `schedules read the way iOS says them`() {
        assertEquals("Every day at 03:00", automationScheduleText(job()))
        assertEquals(
            "Mon at 06:00",
            automationScheduleText(job(""""schedule":{"atMinutes":360,"days":["mon"]}"""))
        )
        assertEquals("Manual", automationScheduleText(job(""""schedule":{"mode":"manual"}""")))
        assertEquals(
            "Cron 0 9 * * 1",
            automationScheduleText(job(""""schedule":{"mode":"cron","cron":"0 9 * * 1"}"""))
        )
        assertEquals(
            "Every 6 hours",
            automationScheduleText(job(""""schedule":{"mode":"interval","everySecs":21600}"""))
        )
        assertEquals(
            "Every hour",
            automationScheduleText(job(""""schedule":{"mode":"interval","everySecs":3600}"""))
        )
        assertEquals(
            "Every 4–8 hours between 09:00 and 17:00 on Mon, Tue",
            automationScheduleText(
                job(
                    """"schedule":{"mode":"interval","everySecs":14400,"everyMaxSecs":28800,""" +
                        """"fromMinutes":540,"untilMinutes":1020,"days":["mon","tue"]}"""
                )
            )
        )
        assertEquals(
            "Every 30 minutes to 2 hours",
            automationScheduleText(
                job(""""schedule":{"mode":"interval","everySecs":1800,"everyMaxSecs":7200}""")
            )
        )
    }

    @Test
    fun `calendar rules, windows and random days`() {
        assertEquals(
            "On the 1st, 22nd and last day of every month at 09:00",
            automationScheduleText(
                job(""""schedule":{"atMinutes":540,"monthDays":[1,22],"lastDay":true}""")
            )
        )
        assertEquals(
            "On the first Mon of every month at 09:00 and 17:30",
            automationScheduleText(
                job(
                    """"schedule":{"atMinutes":540,"alsoAtMinutes":[1050],""" +
                        """"nth":"first","nthOf":"mon"}"""
                )
            )
        )
        assertEquals(
            "Once, on 2026-10-20 at 09:00",
            automationScheduleText(job(""""schedule":{"atMinutes":540,"onDates":["2026-10-20"]}"""))
        )
        assertEquals(
            "3 times a day between 09:00 and 17:00",
            automationScheduleText(
                job(""""schedule":{"atMinutes":540,"untilMinutes":1020,"times":3}""")
            )
        )
        assertEquals(
            "2 random weekdays a week at 09:00",
            automationScheduleText(
                job(
                    """"schedule":{"atMinutes":540,"pickDays":2,""" +
                        """"days":["mon","tue","wed","thu","fri"]}"""
                )
            )
        )
    }

    @Test
    fun `the row line leads with what's unread`() {
        val nightly = job(""""nextFireAt":${t + 9 * 3600 + 40 * 60},"unread":1""")
        assertEquals(
            "1 new message · Every day at 03:00 · in 10 hours",
            automationRowStatusText(nightly, clock)
        )
        assertEquals(
            "9+ new messages · Every day at 03:00",
            automationRowStatusText(job(""""unread":12"""), clock)
        )
        assertEquals(
            "Off · Mon at 06:00",
            automationRowStatusText(
                job(""""enabled":false,"schedule":{"atMinutes":360,"days":["mon"]}"""),
                clock
            )
        )
        assertEquals(
            "Running",
            automationRowStatusText(job(""""running":true,"unread":3"""), clock)
        )
        assertEquals(
            "Bad schedule",
            automationRowStatusText(job(""""valid":false,"error":"Bad schedule""""), clock)
        )
        assertEquals(
            AutomationTone.Green,
            automationStatusTone(job(""""lastResult":"completed""""))
        )
        assertEquals(AutomationTone.Secondary, automationStatusTone(job(""""enabled":false""")))
        assertEquals(AutomationTone.Blue, automationStatusTone(job(""""running":true""")))
    }

    @Test
    fun `relative dates round below a day and count calendar days above it`() {
        assertEquals("now", clock.relative(t))
        assertEquals("in 20 seconds", clock.relative(t + 20))
        assertEquals("30 seconds ago", clock.relative(t - 30))
        assertEquals("in 1 minute", clock.relative(t + 89))
        assertEquals("2 minutes ago", clock.relative(t - 91))
        assertEquals("in 1 hour", clock.relative(t + 3599))
        assertEquals("in 9 hours", clock.relative(t + 9 * 3600 + 29 * 60))
        assertEquals("22 hours ago", clock.relative(t - 77_760))
        assertEquals("tomorrow", clock.relative(t + 23 * 3600 + 31 * 60))
        assertEquals("yesterday", clock.relative(t - 86_400))
        assertEquals("in 2 days", clock.relative(t + 47 * 3600))
        assertEquals("in 6 days", clock.relative(t + 570_240))
        assertEquals("next week", clock.relative(t + 8 * 86_400))
        assertEquals("in 2 weeks", clock.relative(t + 10 * 86_400))
    }

    @Test
    fun `clock text names the day the way you'd say it`() {
        val tomorrow3am = Instant.parse("2026-10-17T03:00:00Z").epochSecond
        assertEquals("Tomorrow at 3:00 AM", clock.clock(tomorrow3am))
        assertEquals("Today at 1:00 AM", clock.clock(t - 80 * 60))
        assertEquals(
            "Mon at 6:00 AM",
            clock.clock(Instant.parse("2026-10-19T06:00:00Z").epochSecond)
        )
        assertEquals(
            "Oct 30 at 6:00 AM",
            clock.clock(Instant.parse("2026-10-30T06:00:00Z").epochSecond)
        )
    }

    @Test
    fun `durations, elapsed clocks and costs`() {
        assertEquals("1 min 12 sec", automationDurationText(72))
        assertEquals("1 sec", automationDurationText(1))
        assertEquals("1 hr 2 min 5 sec", automationDurationText(3725))
        assertEquals("2 hr", automationDurationText(7200))
        assertEquals("45s", automationElapsedText(since = 0, nowSeconds = 45))
        assertEquals("4m 05s", automationElapsedText(since = 0, nowSeconds = 245))
        assertEquals("1h 03m", automationElapsedText(since = 0, nowSeconds = 3780))
        assertEquals("$0.42", automationUsdText(0.42))
        assertEquals("$12", automationUsdText(12.4))
        assertEquals("$0", automationUsdText(0.0))
    }

    @Test
    fun `replies thread under the run they continue`() {
        val threads = automationThreads(
            listOf(
                entry(1, """"session":"s1""""),
                entry(2),
                entry(3, """"resumed":"s1","session":"s2","question":"why?""""),
                entry(4, """"follows":2,"unread":true"""),
                entry(5, """"resumed":"s2"""")
            )
        )
        assertEquals(listOf(1L, 2L), threads.map { it.id })
        assertEquals(listOf(3L, 5L), threads[0].replies.map { it.at })
        assertEquals(5L, threads[0].tail.at)
        assertEquals(listOf(4L), threads[1].replies.map { it.at })
        assertEquals(listOf(false, true), threads.map { it.unread })
    }

    @Test
    fun `the list is a feed - unread, running, newest, then by name`() {
        val jobs = listOf(
            job(""""id":"b","label":"beta","lastRunAt":10"""),
            job(""""id":"a","label":"Alpha","lastRunAt":10"""),
            job(""""id":"old","lastRunAt":5,"unread":1"""),
            job(""""id":"run","running":true"""),
            job(""""id":"new","lastRunAt":50"""),
            job(""""id":"never","label":"zzz"""")
        )
        assertEquals(
            listOf("old", "run", "new", "a", "b", "never"),
            automationsSortedForList(jobs).map { it.id }
        )
    }

    @Test
    fun `scope, agent and first line`() {
        assertEquals("storefront", automationScopeLabel(job(), projectCount = 5))
        assertEquals(
            "2 projects",
            automationScopeLabel(job(""""targets":["a","b"]"""), projectCount = 5)
        )
        assertEquals(
            "All projects",
            automationScopeLabel(job(""""targets":["a","b"]"""), projectCount = 2)
        )
        assertEquals("No project", automationScopeLabel(job(""""standalone":true"""), 2))
        assertEquals("No project", automationScopeText(job(""""standalone":true""")))
        assertEquals("Default", automationAgentText(job()))
        assertEquals(
            "Claude · opus · high effort",
            automationAgentText(job(""""agent":"claude","model":"opus","effort":"high""""))
        )
        assertEquals("Fixed the build", automationFirstLine("\n## **Fixed** the build\nmore"))
        assertEquals("All good", automationFirstLine("- \n- All good"))
        assertNull(automationFirstLine("#\n"))
    }

    @Test
    fun `a checked run says whether its checks held`() {
        val passed = entry(1, """"verified":true""")
        val failed = entry(1, """"verified":false""")
        assertEquals("Done — checks passed", automationEntryLabel(passed))
        assertEquals("Done — checks failed", automationEntryLabel(failed))
        assertEquals("Done", automationEntryLabel(entry(1)))
        assertEquals(
            "Problem during the run",
            automationEntryLabel(entry(1, """"result":"error","verified":true"""))
        )
    }

    @Test
    fun `a live run says what it is doing before it says where`() {
        val busy = job().copy(running = true)
        assertEquals("", automationRunPlaceText(busy))
        assertEquals("Checking for work…", automationRunPlaceText(busy.copy(runningStep = "check")))
        assertEquals(
            "Copying the project…",
            automationRunPlaceText(busy.copy(runningStep = "copy"))
        )
        assertEquals(
            "Working in UAI-5401",
            automationRunPlaceText(busy.copy(runningInName = "UAI-5401"))
        )
    }

    @Test
    fun `a question leads with its first line and the rest reads under it`() {
        assertEquals(
            "Ship it?" to "line one\n  line two",
            automationAskParts("Ship it?\n\nline one\n  line two\n")
        )
        assertEquals("Ship it?" to "", automationAskParts("Ship it?"))
    }
}
