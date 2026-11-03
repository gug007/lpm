package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AutomationTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    @Test
    fun parsesACalendarJob() {
        val job = AutomationJob.parse(
            obj(
                """
                {"id": "nightly-tests", "project": "storefront", "valid": true, "source": "project",
                 "label": "Nightly tests", "emoji": "🧪", "enabled": true, "duplicate": false,
                 "runKind": "prompt", "description": "Run the test suite",
                 "schedule": {"mode": "calendar", "atMinutes": 120, "alsoAtMinutes": [600, 900],
                              "days": ["mon", "fri"], "untilMinutes": 180, "pickDays": 1,
                              "monthDays": [1, 15], "lastDay": true, "nth": "first", "nthOf": "mon",
                              "onDates": ["2026-12-24"]},
                 "lastRunAt": 1760000000, "lastResult": "ok", "nextFireAt": null, "running": false,
                 "agent": "claude", "model": "opus", "effort": "high",
                 "targets": ["storefront"], "targetCount": 1, "runningCount": 0, "unread": 2}
                """
            )
        )
        assertEquals("Run the test suite", job.summary)
        assertEquals("calendar", job.scheduleMode)
        assertEquals(120, job.atMinutes)
        assertEquals(listOf(600, 900), job.alsoAtMinutes)
        assertEquals(listOf("mon", "fri"), job.days)
        assertEquals(180, job.untilMinutes)
        assertEquals(1, job.times)
        assertEquals(1, job.pickDays)
        assertEquals(listOf(1, 15), job.monthDays)
        assertTrue(job.lastDay)
        assertEquals(listOf("2026-12-24"), job.onDates)
        assertNull(job.fromMinutes)
        assertEquals(1_760_000_000L, job.lastRunAt)
        assertNull(job.nextFireAt)
        assertEquals(2, job.unread)
        assertEquals("Nightly tests", job.displayName)
        assertEquals("storefront\nnightly-tests", job.key)
        assertEquals("", job.lastNote)
        assertNull(job.lastDurationSecs)
    }

    @Test
    fun parsesWhatTheLastRunSaid() {
        val job = AutomationJob.parse(
            obj(
                """
                {"id": "nightly-tests", "valid": true, "lastResult": "error",
                 "lastNote": "The check couldn't run: npm not found", "lastDurationSecs": 270}
                """
            )
        )
        assertEquals("The check couldn't run: npm not found", job.lastNote)
        assertEquals(270, job.lastDurationSecs)
        val cleared = AutomationJob.parse(
            obj("""{"id": "a", "lastNote": null, "lastDurationSecs": null}""")
        )
        assertEquals("", cleared.lastNote)
        assertNull(cleared.lastDurationSecs)
    }

    @Test
    fun runTargetsFollowTheJobsLayer() {
        val global = AutomationJob.parse(
            obj("""{"id": "deps", "targets": ["a", "b"], "schedule": {"mode": "manual"}}""")
        )
        assertEquals(listOf("a", "b"), global.runsIn)
        assertEquals("a", global.runProject)
        assertEquals("deps", global.displayName)

        val older = AutomationJob.parse(obj("""{"id": "x", "project": "solo"}"""))
        assertEquals(listOf("solo"), older.runsIn)
        assertEquals("solo", older.runProject)

        val standalone = AutomationJob.parse(
            obj("""{"id": "s", "project": "p", "targets": ["p"], "standalone": true}""")
        )
        assertEquals(emptyList<String>(), standalone.runsIn)
        assertEquals(listOf(""), standalone.runTargets)
        assertEquals("", standalone.runProject)

        val nowhere = AutomationJob.parse(obj("""{"id": "n"}"""))
        assertEquals(emptyList<String>(), nowhere.runTargets)
        assertEquals("", nowhere.runProject)
        assertEquals("\nn", nowhere.key)
    }

    @Test
    fun aBadScheduleListDropsWhole() {
        val job = AutomationJob.parse(
            obj("""{"schedule": {"alsoAtMinutes": [60, "x"], "times": 3}}""")
        )
        assertEquals(emptyList<Int>(), job.alsoAtMinutes)
        assertEquals(3, job.times)
    }

    @Test
    fun historyEntryDefaults() {
        val e = AutomationHistoryEntry.parse(
            obj("""{"at": 1760000000, "result": "ok", "costUsd": 2}""")
        )
        assertEquals(1_760_000_000L, e.id)
        assertEquals(1, e.count)
        assertEquals(2.0, e.costUsd!!, 0.0)
        assertNull(e.verified)
        assertNull(e.durationSecs)
        assertFalse(e.unread)

        val full = AutomationHistoryEntry.parse(
            obj(
                """{"at": 5, "count": 3, "verified": false, "follows": 4, "compacted": true, "unread": true, "costUsd": 0.42}"""
            )
        )
        assertEquals(false, full.verified)
        assertEquals(4L, full.follows)
        assertTrue(full.compacted)
        assertEquals(0.42, full.costUsd!!, 1e-9)
    }

    @Test
    fun liveOutputNeedsAnObject() {
        assertNull(AutomationLiveOutput.parse(null))
        assertEquals(
            AutomationLiveOutput(7, ""),
            AutomationLiveOutput.parse(obj("""{"startedAt": 7}"""))
        )
    }
}
