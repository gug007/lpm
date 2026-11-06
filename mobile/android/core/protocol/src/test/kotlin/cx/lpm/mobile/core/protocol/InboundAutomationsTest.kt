package cx.lpm.mobile.core.protocol

import cx.lpm.mobile.core.model.AutomationLiveOutput
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class InboundAutomationsTest {
    @Test
    fun jobs() {
        val f = decode<Inbound.Jobs>(
            """{ "t": "jobs", "ok": true, "jobs": [{ "id": "nightly-tests", "project": "storefront", "valid": true,
                 "source": "project", "label": "Nightly tests", "enabled": true, "runKind": "prompt",
                 "schedule": { "mode": "interval", "everySecs": 3600, "everyMaxSecs": 5400, "fromMinutes": 540 },
                 "lastRunAt": null, "running": true, "runningSince": 1760000000, "targets": ["storefront"],
                 "targetCount": 1, "runningCount": 1, "standalone": false, "unread": 0 }] }"""
        )
        val job = f.jobs.single()
        assertEquals(3600, job.everySecs)
        assertEquals(5400, job.everyMaxSecs)
        assertEquals(540, job.fromMinutes)
        assertNull(job.lastRunAt)
        assertEquals(1_760_000_000L, job.runningSince)
        assertNull(f.error)
        val failed = decode<Inbound.Jobs>("""{ "t": "jobs", "jobs": [{ "id": "x" }] }""")
        assertTrue(failed.jobs.isEmpty())
        assertEquals("Couldn't load automations.", failed.error)
    }

    @Test
    fun jobHistory() {
        val f = decode<Inbound.JobHistory>(
            """{ "t": "jobHistory", "project": "storefront", "jobId": "nightly-tests", "ok": true,
                 "entries": [{ "at": 1760000000, "result": "ok", "durationSecs": 42, "costUsd": 0.12, "verified": true }] }"""
        )
        assertEquals(42, f.entries.single().durationSecs)
        assertEquals(true, f.entries.single().verified)
        assertEquals(
            Inbound.JobHistory("a", "j", emptyList(), "Couldn't load run history."),
            Inbound.parse("""{ "t": "jobHistory", "project": "a", "jobId": "j", "ok": false }""")
        )
    }

    @Test
    fun jobLiveOutput() {
        assertEquals(
            Inbound.JobLiveOutput(
                "a",
                "j",
                AutomationLiveOutput(1_760_000_000, "Running tests…"),
                null
            ),
            Inbound.parse(
                """{ "t": "jobLiveOutput", "project": "a", "jobId": "j", "ok": true,
                     "live": { "startedAt": 1760000000, "text": "Running tests…" } }"""
            )
        )
        assertEquals(
            Inbound.JobLiveOutput("a", "j", null, null),
            Inbound.parse(
                """{ "t": "jobLiveOutput", "project": "a", "jobId": "j", "ok": true, "live": null }"""
            )
        )
        assertEquals(
            "Couldn't load live output.",
            decode<Inbound.JobLiveOutput>("""{ "t": "jobLiveOutput", "live": {} }""").error
        )
    }

    @Test
    fun runStopAndEnableAreMutations() {
        for (t in listOf("runJob", "stopJob", "takeOverJob", "setJobEnabled")) {
            assertEquals(
                Inbound.AutomationMutation("a", "j", null),
                Inbound.parse("""{ "t": "$t", "project": "a", "jobId": "j", "ok": true }""")
            )
            assertEquals(
                Inbound.AutomationMutation("a", "j", "Couldn't update the automation."),
                Inbound.parse("""{ "t": "$t", "project": "a", "jobId": "j" }""")
            )
        }
    }

    @Test
    fun followup() {
        assertEquals(
            Inbound.AutomationFollowup("a", "j", null),
            Inbound.parse(
                """{ "t": "sendJobFollowup", "project": "a", "jobId": "j", "ok": true }"""
            )
        )
        assertEquals(
            Inbound.AutomationFollowup("a", "j", "Couldn't send the message."),
            Inbound.parse(
                """{ "t": "sendJobFollowup", "project": "a", "jobId": "j", "ok": false }"""
            )
        )
    }

    @Test
    fun answersAndDismissalsReportBack() {
        assertEquals(
            Inbound.AutomationAnswer("a", "j", null),
            Inbound.parse(
                """{ "t": "answerJobQuestion", "project": "a", "jobId": "j", "ok": true }"""
            )
        )
        assertEquals(
            Inbound.AutomationAnswer("a", "j", "This question was already answered."),
            Inbound.parse(
                """{ "t": "dismissJobQuestion", "project": "a", "jobId": "j", "ok": false,
                     "error": "This question was already answered." }"""
            )
        )
    }

    @Test
    fun jobConfigKeepsTheRawBody() {
        val f = decode<Inbound.JobConfig>(
            """{ "t": "jobConfig", "project": "a", "jobId": "j", "ok": true,
                 "job": { "label": "Nightly", "schedule": "0 2 * * *", "prompt": "run tests" } }"""
        )
        assertEquals(
            Json.parseToJsonElement(
                """{ "label": "Nightly", "schedule": "0 2 * * *", "prompt": "run tests" }"""
            ),
            f.job
        )
        assertEquals(
            Inbound.JobConfig("a", "j", null, "Couldn't load the automation."),
            Inbound.parse("""{ "t": "jobConfig", "project": "a", "jobId": "j", "job": {} }""")
        )
    }

    @Test
    fun saveAndDelete() {
        assertEquals(
            Inbound.JobSaved("j", null),
            Inbound.parse("""{ "t": "saveJob", "ok": true, "id": "j" }""")
        )
        assertEquals(
            Inbound.JobSaved("j", "Bad cron"),
            Inbound.parse("""{ "t": "saveJob", "ok": false, "id": "j", "error": "Bad cron" }""")
        )
        assertEquals(
            Inbound.JobDeleted("j", null),
            Inbound.parse("""{ "t": "deleteJob", "ok": true, "id": "j" }""")
        )
        assertEquals(
            Inbound.JobDeleted("", "Couldn't delete the automation."),
            Inbound.parse("""{ "t": "deleteJob" }""")
        )
    }

    @Test
    fun jobsChanged() {
        assertSame(Inbound.JobsChanged, Inbound.parse("""{ "t": "jobs-changed" }"""))
    }
}
