package cx.lpm.mobile.feature.automations.editor

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class JobEditorDraftTest {
    private fun body(json: String) = Json.parseToJsonElement(json) as JsonObject

    private fun roundTrip(json: String, writesProjects: Boolean = true) {
        val original = body(json)
        assertEquals(original, JobEditorDraft.from(original).buildJob(writesProjects))
    }

    @Test
    fun `a prompt job with every option comes back exactly as the desktop wrote it`() = roundTrip(
        """{"label":"Dependency check","emoji":"📦",""" +
            """"schedule":{"at":"06:00","until":"09:30","times":2,"days":["mon","wed","fri"],""" +
            """"pickDays":2},"check":"git fetch && git status | grep behind",""" +
            """"verify":"npm test","duplicate":{"mode":"worktree","reinstallDeps":true},""" +
            """"run":{"prompt":"Update what's safe.","agent":"codex","model":"gpt-6-sol",""" +
            """"effort":"max","access":"read","quiet":true,"memory":true},""" +
            """"sendTo":{"slack":"#builds"},"projects":["blog","storefront"]}"""
    )

    @Test
    fun `commands, intervals, manual runs and actions round-trip too`() {
        roundTrip(
            """{"label":"Nightly","schedule":{"at":"03:00"},"run":{"cmd":"npm test"}}""",
            writesProjects = false
        )
        roundTrip(
            """{"label":"Poll","schedule":{"every":"4-8h"},"duplicate":true,""" +
                """"run":{"cmd":"make poll"},"projects":[]}"""
        )
        roundTrip(
            """{"label":"Copy","schedule":{"manual":true},""" +
                """"duplicate":{"pullLatest":false,"excludeUncommitted":true},""" +
                """"run":{"action":"deploy","prompt":"Ship it"}}""",
            writesProjects = false
        )
        roundTrip(
            """{"label":"Short","schedule":{"every":"30m"},"run":{"prompt":"Look"}}""",
            writesProjects = false
        )
    }

    @Test
    fun `a Claude account set on the Mac survives a save, the main login too`() {
        roundTrip(
            """{"label":"Work","schedule":{"manual":true},""" +
                """"run":{"prompt":"Look","claudeAccount":"work"}}""",
            writesProjects = false
        )
        roundTrip(
            """{"label":"Main","schedule":{"manual":true},""" +
                """"run":{"prompt":"Look","agent":"claude","claudeAccount":""}}""",
            writesProjects = false
        )
    }

    @Test
    fun `a schedule the editor can't rebuild is written back as read`() {
        val kept = listOf(
            """{"cron":"0 9 * * 1"}""",
            """{"on":"ciFailed","branches":["main"],"atMost":"day"}""",
            """{"at":["09:00","17:00"]}""",
            """{"every":"2h","at":"09:00","until":"17:00"}""",
            """{"at":"09:00","days":["1","15"]}""",
            """{"at":"09:00","days":"weekdays"}"""
        )
        for (schedule in kept) {
            val draft = JobEditorDraft.from(body("""{"label":"x","schedule":$schedule}"""))
            assertEquals(body(schedule), draft.keptSchedule)
            assertEquals(body(schedule), draft.buildJob(false)["schedule"])
        }
        assertNull(
            JobEditorDraft.from(body("""{"schedule":{"at":"09:00","days":["Mon"]}}""")).keptSchedule
        )
    }

    @Test
    fun `seeding reads the shapes older bodies use`() {
        val d = JobEditorDraft.from(
            body(
                """{"label":"Odd","schedule":{"every":6},"run":{"prompt":"p","agent":"Claude",""" +
                    """"effort":"HIGH","access":"READ"},"duplicate":true}"""
            )
        )
        assertEquals(ScheduleMode.Interval, d.scheduleMode)
        assertEquals(6, d.intervalValue)
        assertEquals(IntervalUnit.Hours, d.intervalUnit)
        assertEquals("claude", d.agent)
        assertEquals("high", d.effort)
        assertTrue(d.readOnly)
        assertFalse(d.memory)
        assertEquals(DuplicateMode.Copy, d.duplicateMode)
        assertEquals(JsonPrimitive(true), d.buildJob(false)["duplicate"])
    }

    @Test
    fun `intervals parse in any of the desktop's spellings`() {
        fun parse(s: String) = parseEvery(JsonPrimitive(s))
        assertEquals(Triple(2, IntervalUnit.Days, null), parse("2d"))
        assertEquals(Triple(4, IntervalUnit.Hours, 8), parse("4h-8h"))
        assertEquals(Triple(4, IntervalUnit.Hours, 8), parse("4-8h"))
        assertEquals(Triple(30, IntervalUnit.Minutes, 30), parse("30-10m"))
        assertEquals(Triple(6, IntervalUnit.Hours, null), parse("soon"))
        assertEquals(Triple(3, IntervalUnit.Hours, null), parseEvery(JsonPrimitive(3.7)))
    }

    @Test
    fun `save waits for a name, a valid time and something to run`() {
        val ready = JobEditorDraft(label = "Docs", prompt = "Write docs")
        assertNull(ready.validationError(standalone = true))
        assertEquals("Give this automation a name.", ready.copy(label = " ").validationError(false))
        assertEquals("Enter a prompt to run.", ready.copy(prompt = "\n").validationError(false))
        assertEquals(
            "Standalone automations can't run an action.",
            ready.copy(runMode = RunMode.Action, action = "deploy").validationError(true)
        )
        assertEquals("Pick a valid time.", ready.copy(time = "25:00").validationError(false))
        val window = ready.copy(randomWindow = true, time = "09:00", untilTime = "09:20")
        assertEquals(
            "That's more runs than the window has room for.",
            window.copy(timesPerDay = 5).validationError(false)
        )
        assertEquals(
            "The window has to end after it starts.",
            window.copy(untilTime = "08:00").validationError(false)
        )
        assertEquals(
            "The longest gap has to be at least the shortest.",
            ready.copy(
                scheduleMode = ScheduleMode.Interval,
                varyInterval = true,
                intervalValue = 6,
                intervalMaxValue = 2
            ).validationError(false)
        )
    }

    @Test
    fun `the form's linked controls move together`() {
        val d = JobEditorDraft()
        assertEquals(listOf("mon"), d.withRepeat(RepeatChoice.Days).days)
        assertEquals(
            RepeatChoice.Daily,
            d.withRepeat(RepeatChoice.Days).withRepeat(RepeatChoice.Daily).repeat
        )
        assertEquals(20, d.withIntervalValue(20).intervalMaxValue)
        assertEquals(0, d.pickDaysChoice)
        assertEquals(2, d.withPickDays(2).pickDaysChoice)
        assertEquals("🌙", d.withEmoji("🌙📦").emoji)
        assertEquals("👍🏽", d.withEmoji("👍🏽x").emoji)
        val action = d.copy(runMode = RunMode.Action, targets = listOf("a"))
        assertEquals(RunMode.Prompt, action.toggleTarget("b").runMode)
        assertEquals(
            listOf("", "low", "medium", "high", "xhigh", "max"),
            d.copy(agent = "claude").effortOptions
        )
        assertEquals("", d.copy(agent = "codex", effort = "max").clampedEffort().effort)
        assertEquals(
            "max",
            d.copy(agent = "codex", model = "gpt-6-luna", effort = "max").clampedEffort().effort
        )
        assertEquals("", d.copy(agent = "gemini", effort = "low").clampedEffort().effort)
    }

    @Test
    fun `the footer says what the schedule will do`() {
        assertEquals(
            "Every day at 09:00. It starts within a few minutes of that time, so automations " +
                "set to the same hour don't all begin at once.",
            JobEditorDraft().scheduleSummary()
        )
        assertEquals(
            "3 times on Mon, Wed between 09:00 and 17:00. The time inside the window is picked " +
                "for you and changes each day.",
            JobEditorDraft(
                days = listOf("wed", "mon"),
                randomWindow = true,
                timesPerDay = 3
            ).scheduleSummary()
        )
        assertEquals(
            "2 random weekdays a week at 09:00. It starts within a few minutes of that time, so " +
                "automations set to the same hour don't all begin at once.",
            JobEditorDraft(
                days = listOf("mon", "tue", "wed", "thu", "fri"),
                randomDays = true,
                pickDays = 2
            ).scheduleSummary()
        )
        assertEquals(
            "Every 2–5 days. The gap is picked fresh after every run.",
            JobEditorDraft(
                scheduleMode = ScheduleMode.Interval,
                intervalValue = 2,
                intervalMaxValue = 5,
                varyInterval = true,
                intervalUnit = IntervalUnit.Days
            ).scheduleSummary()
        )
        assertEquals(
            "Runs only when you start it.",
            JobEditorDraft(scheduleMode = ScheduleMode.Manual).scheduleSummary()
        )
    }

    @Test
    fun `a new job's id is a slug no other job has`() {
        assertEquals("nightly-tests", uniqueJobId("Nightly  tests!", emptySet()))
        assertEquals(
            "nightly-tests-3",
            uniqueJobId("Nightly tests", setOf("nightly-tests", "nightly-tests-2"))
        )
        assertEquals("job", uniqueJobId("🌙", emptySet()))
        assertEquals(540, parseTimeMinutes("09:00"))
        assertNull(parseTimeMinutes("9"))
    }
}
