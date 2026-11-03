package cx.lpm.mobile.feature.automations.format

import cx.lpm.mobile.feature.automations.job
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutomationFailureTest {
    private val now = Instant.parse("2026-10-16T02:20:00Z")
    private val clock = AutomationClock(now, ZoneOffset.UTC, Locale.US)
    private val next = """"nextFireAt":${now.epochSecond + 3600}"""

    @Test
    fun `a failed run says how long it ran and why`() {
        assertEquals(
            "Problem during the run after 4m 30s · The check couldn't run: npm not found",
            automationStatusText(
                job(
                    """"lastResult":"error","lastDurationSecs":270,""" +
                        """"lastNote":"The check couldn't run: npm not found",$next"""
                ),
                clock
            )
        )
        assertEquals(
            "Stopped — ran too long after 1h",
            automationStatusText(job(""""lastResult":"timed-out","lastDurationSecs":3600"""), clock)
        )
        assertEquals(
            "Conversation full · Out of room",
            automationStatusText(
                job(""""lastResult":"context-full","lastNote":"Out of room""""),
                clock
            )
        )
        assertEquals(
            "Problem during the run",
            automationStatusText(job(""""lastResult":"error","lastDurationSecs":0"""), clock)
        )
    }

    @Test
    fun `the note is flattened to one line without markdown`() {
        assertEquals(
            "Tests failed: CheckoutForm expected 41.98 got 45.98",
            automationNoteLine(
                "## **Tests failed:**\n\n  `CheckoutForm`\n> expected 41.98 | got 45.98"
            )
        )
        assertEquals("", automationNoteLine(" \n# \n"))
        assertEquals(
            "See the docs for why: before after",
            automationNoteLine(
                "See [the docs](https://x.dev) for why: ```sh\nnpm test\n``` before after"
            )
        )
        assertEquals("Done ok", automationNoteLine("Done \uE200cite\uE202turn0\uE201 ok"))
        assertEquals("a b…", automationNoteLine("a b c", max = 3))
        assertEquals("abc", automationNoteLine("abc", max = 3))
        assertEquals(
            "Problem during the run after 12s",
            automationStatusText(
                job(""""lastResult":"error","lastDurationSecs":12,"lastNote":"**\n_""""),
                clock
            )
        )
    }

    @Test
    fun `anything more pressing than the failure keeps its own text`() {
        val failed = """"lastResult":"error","lastNote":"boom""""
        assertEquals("Running", automationStatusText(job("$failed,\"running\":true"), clock))
        assertEquals(
            "Off · Every day at 03:00",
            automationStatusText(job("$failed,\"enabled\":false"), clock)
        )
        assertEquals(
            "Broken",
            automationStatusText(job("$failed,\"valid\":false,\"error\":\"Broken\""), clock)
        )
        assertEquals(
            "Waiting for your answer · Ship it?",
            automationStatusText(
                job("""$failed,"ask":{"id":"q","questions":[{"id":"1","text":"Ship it?"}]}"""),
                clock
            )
        )
        assertEquals(
            "Every day at 03:00 · in 1 hour",
            automationStatusText(job(""""lastResult":"completed","lastNote":"ok",$next"""), clock)
        )
    }

    @Test
    fun `only a red result counts as failed`() {
        listOf("error", "timed-out", "context-full").forEach {
            assertTrue(it, automationLastRunFailed(job(""""lastResult":"$it"""")))
        }
        listOf("", "completed", "found-work", "canceled", "skipped-overlap", "nothing-to-do")
            .forEach { assertFalse(it, automationLastRunFailed(job(""""lastResult":"$it""""))) }
        assertFalse(automationLastRunFailed(job(""""lastResult":"error","enabled":false""")))
        assertFalse(automationLastRunFailed(job(""""lastResult":"error","running":true""")))
        assertFalse(automationLastRunFailed(job(""""lastResult":"error","valid":false""")))
    }

    @Test
    fun `run lengths drop the parts that are zero`() {
        assertEquals("0s", automationRunLengthText(0))
        assertEquals("12s", automationRunLengthText(12))
        assertEquals("4m", automationRunLengthText(240))
        assertEquals("4m 30s", automationRunLengthText(270))
        assertEquals("1h", automationRunLengthText(3600))
        assertEquals("1h 12m", automationRunLengthText(4320 + 59))
    }
}
