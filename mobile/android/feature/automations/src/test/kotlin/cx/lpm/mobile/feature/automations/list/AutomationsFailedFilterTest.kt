package cx.lpm.mobile.feature.automations.list

import cx.lpm.mobile.core.data.automations.AutomationsState
import cx.lpm.mobile.feature.automations.format.AutomationClock
import cx.lpm.mobile.feature.automations.job
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AutomationsFailedFilterTest {
    private val clock =
        AutomationClock(Instant.parse("2026-10-16T02:20:00Z"), ZoneOffset.UTC, Locale.US)

    private val broken = job(""""id":"broken","lastResult":"error","lastNote":"npm not found"""")
    private val slow = job(""""id":"slow","lastResult":"timed-out","unread":1""")
    private val fine = job(""""id":"fine","lastResult":"completed","unread":2""")
    private val off = job(""""id":"off","lastResult":"error","enabled":false""")
    private val state = AutomationsState(jobs = listOf(broken, slow, fine, off), loaded = true)

    private fun ids(s: AutomationsUiState) = (s.unread + s.read).map { it.job.id }

    @Test
    fun `failed rows are counted and marked for Retry`() {
        val all = state.listState(project = null, projectCount = 1, clock = clock)
        assertEquals(2, all.failedCount)
        assertFalse(all.failedOnly)
        assertEquals(listOf("slow", "fine", "broken", "off"), ids(all))
        assertEquals(emptyList<String>(), all.hiddenUnread.map { it.id })
        assertEquals(
            mapOf("slow" to true, "broken" to true, "fine" to false, "off" to false),
            (all.unread + all.read).associate { it.job.id to it.failed }
        )
        assertEquals("Problem during the run · npm not found", all.read.first().status)
        assertEquals("2 new messages · Every day at 03:00", all.unread[1].status)
    }

    @Test
    fun `the filter keeps only failed rows and lets go once none are left`() {
        val failed = state.listState(null, 1, clock, failedOnly = true)
        assertTrue(failed.failedOnly)
        assertEquals(listOf("slow"), failed.unread.map { it.job.id })
        assertEquals(listOf("broken"), failed.read.map { it.job.id })
        assertEquals(
            "Mark all read still reads it",
            listOf("fine"),
            failed.hiddenUnread.map {
                it.id
            }
        )
        assertTrue(failed.anyUnread)

        val healed = AutomationsState(jobs = listOf(fine, off), loaded = true)
            .listState(null, 1, clock, failedOnly = true)
        assertEquals(0, healed.failedCount)
        assertFalse(healed.failedOnly)
        assertEquals(listOf("fine", "off"), ids(healed))
    }
}
