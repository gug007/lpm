package cx.lpm.mobile.feature.git.review

import java.time.Instant
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "en-rUS")
class RelativeTimeTest {
    private val now = Instant.ofEpochSecond(1_792_065_600)

    private fun ago(seconds: Long) = relativeNamed(now.minusSeconds(seconds), now, ZoneOffset.UTC)

    @Test
    fun `the largest unit that differs, named for one day or more`() {
        assertEquals("now", ago(0))
        assertEquals("12 seconds ago", ago(12))
        assertEquals("1 minute ago", ago(60))
        assertEquals("2 hours ago", ago(2 * 3_600))
        assertEquals("yesterday", ago(30 * 3_600))
    }
}
