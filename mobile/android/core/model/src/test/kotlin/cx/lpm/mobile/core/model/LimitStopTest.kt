package cx.lpm.mobile.core.model

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LimitStopTest {
    private val now = 1_800_000_000_000.0
    private val at = 1_800_000_000L

    private fun parse(json: String) = LimitStop.parse(Json.parseToJsonElement(json).jsonObject)

    private val weekly = parse(
        """{"kind":"limit","account":"default","accountLabel":"Main login","window":"weekly",
           "resetsAt":${at + 62 * 3600},
           "offer":{"account":"work","label":"Work","fiveHour":18,"weekly":41,"near":false}}"""
    )!!

    @Test
    fun namesTheAccountTheLimitAndWhenItResets() {
        assertEquals("Main login hit its weekly limit", weekly.headline)
        assertEquals("Main login hit its 5-hour limit", weekly.copy(window = "fiveHour").headline)
        assertEquals("resets in 2d 14h", weekly.reset(now))
    }

    @Test
    fun namesTheAccountWithRoomAndItsUsage() {
        assertEquals("Work has room · 5-hour 18% · weekly 41%", weekly.detail(now))
        val near = weekly.copy(
            offer = weekly.offer!!.copy(fiveHour = 93.0, weekly = null, near = true)
        )
        assertEquals("Work has the most room · 5-hour 93%", near.detail(now))
    }

    @Test
    fun saysWhichAccountFreesUpFirstWhenNoneHasRoom() {
        val full = weekly.copy(
            offer = null,
            firstFree = LimitStop.FirstFree(
                "work",
                "Work",
                at + 80 * 60
            )
        )
        assertEquals("Every account is at a limit. Work resets first, in 1h 20m.", full.detail(now))
        assertEquals(
            "No other account in your list has room.",
            weekly.copy(offer = null).detail(now)
        )
    }

    @Test
    fun pointsAHoldToSettingsAndAModelLimitToModel() {
        val hold = parse(
            """{"kind":"hold","account":"default","accountLabel":"Main login","resetsAt":0}"""
        )!!
        assertEquals("Main login was put on hold", hold.headline)
        assertEquals("", hold.reset(now))
        assertTrue(hold.detail(now).startsWith("Account switching is paused."))
        val opus = hold.copy(kind = "model", model = "Opus", resetsAt = at + 3 * 86_400)
        assertEquals("Main login hit its weekly Opus limit", opus.headline)
        assertEquals(
            "This account still works with other models. Type /model to switch.",
            opus.detail(now)
        )
    }

    @Test
    fun isOverOnceTheLimitResets() {
        assertTrue(weekly.holds(now))
        assertFalse(weekly.copy(resetsAt = at - 1).holds(now))
        assertTrue(weekly.copy(kind = "hold", resetsAt = 0).holds(now))
    }

    @Test
    fun aTerminalWithoutAStopHasNone() {
        assertNull(LimitStop.parse(null))
        assertNull(parse("""{"kind":""}"""))
    }
}
