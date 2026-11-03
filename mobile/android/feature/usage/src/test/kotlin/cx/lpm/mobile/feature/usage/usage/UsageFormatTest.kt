package cx.lpm.mobile.feature.usage.usage

import cx.lpm.mobile.core.model.LimitWindow
import cx.lpm.mobile.core.model.durationShort
import cx.lpm.mobile.core.model.resetShort
import cx.lpm.mobile.core.model.resetText
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UsageFormatTest {
    private val now = 1_792_065_600_000.0
    private val hour = 3_600_000.0

    /** A weekly window `elapsed` of the way through, reset that far from [now]. */
    private fun weekly(used: Double, elapsed: Double) =
        LimitWindow(used, ((now + WEEKLY_MS * (1 - elapsed)) / 1000).toLong())

    @Test
    fun `spans read in coarse buckets and never as zero minutes`() {
        assertEquals("now", durationShort(0.0))
        assertEquals("now", durationShort(Double.NaN))
        assertEquals("1m", durationShort(20_000.0))
        assertEquals("59m", durationShort(59 * 60_000.0))
        assertEquals("2h", durationShort(2 * hour))
        assertEquals("2h 10m", durationShort(2 * hour + 600_000))
        assertEquals("3d", durationShort(72 * hour))
        assertEquals("4d 10h", durationShort(106 * hour))
    }

    @Test
    fun `resets read as a countdown and a date`() {
        val resetsAt = ((now + 3 * hour) / 1000).toLong()
        assertEquals("3h", resetShort(resetsAt, now))
        assertEquals("resets in 3h", resetText(resetsAt, now))
        assertEquals("resets now", resetText(resetsAt, now + 4 * hour))
        assertEquals("", resetText(0, now))
        assertEquals("", resetShort(0, now))
        assertTrue(resetAbsolute(resetsAt, ZoneOffset.UTC).startsWith("Oct 15 at 3:00"))
        assertEquals("", resetAbsolute(0))
    }

    @Test
    fun `last reports read as how long ago`() {
        assertEquals("updated just now", updatedText(1_000, now = 20_000.0))
        assertEquals("updated just now", updatedText(1_000_000, now = 0.0))
        assertEquals("updated 4m ago", updatedText(0, now = 240_000.0))
        assertEquals("updated 2h ago", updatedText(0, now = 90 * 60_000.0))
        assertEquals("updated 3d ago", updatedText(0, now = 70 * hour))
    }

    @Test
    fun `use is judged against how much of the window has gone by`() {
        assertEquals(PaceVerdict.Under, computePace(weekly(28.0, 0.43), WEEKLY_MS, now)?.verdict)
        assertEquals(PaceVerdict.On, computePace(weekly(50.0, 0.5), WEEKLY_MS, now)?.verdict)
        assertEquals(PaceVerdict.Over, computePace(weekly(60.0, 0.5), WEEKLY_MS, now)?.verdict)
        assertEquals(PaceVerdict.Early, computePace(weekly(1.0, 0.04), WEEKLY_MS, now)?.verdict)
        assertEquals(
            PaceVerdict.Exhausted,
            computePace(weekly(100.0, 0.5), WEEKLY_MS, now)?.verdict
        )
        assertEquals(
            PaceVerdict.Unknown,
            computePace(weekly(Double.NaN, 0.5), WEEKLY_MS, now)?.verdict
        )
        assertNull(computePace(LimitWindow(50.0, 0), WEEKLY_MS, now))
        assertNull(computePace(null, WEEKLY_MS, now))
        assertTrue(computePace(weekly(50.0, 1.5), WEEKLY_MS, now)!!.expired)
    }

    @Test
    fun `running out is only said when it lands before the reset`() {
        val over = computePace(weekly(60.0, 0.5), WEEKLY_MS, now)!!
        assertEquals(50.0, over.elapsedPercent, 1e-6)
        assertEquals(WEEKLY_MS * 0.5 * 40 / 60, over.exhaustsInMs!!, 1.0)
        assertNull(computePace(weekly(20.0, 0.5), WEEKLY_MS, now)?.exhaustsInMs)
    }

    @Test
    fun `verdicts in words`() {
        assertEquals("too fast", paceLabel(computePace(weekly(60.0, 0.5), WEEKLY_MS, now)))
        assertEquals("will last", paceLabel(computePace(weekly(20.0, 0.5), WEEKLY_MS, now)))
        assertEquals("on pace", paceLabel(computePace(weekly(50.0, 0.5), WEEKLY_MS, now)))
        assertEquals("limit reached", paceLabel(computePace(weekly(120.0, 0.5), WEEKLY_MS, now)))
        assertEquals("", paceLabel(computePace(weekly(1.0, 0.01), WEEKLY_MS, now)))
        assertEquals("", paceLabel(null))
    }
}
