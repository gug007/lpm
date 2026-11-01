package cx.lpm.mobile.core.model

import java.time.Instant
import java.time.ZoneId
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MacKeepAwakeTest {
    private fun obj(json: String): JsonObject = Json.parseToJsonElement(json).jsonObject

    private val base = MacKeepAwake(
        supported = true,
        mode = MacKeepAwake.Mode.Off,
        active = false,
        agents = 0,
        endsIn = null,
        tailMinutes = 5,
        floor = 20,
        power = MacKeepAwake.Power.Idle
    )
    private val zone = ZoneId.of("UTC")
    private val now = Instant.parse("2026-11-02T14:00:00Z")

    @Test
    fun parsesTheStateAndFillsWhatAnOlderMacLeavesOut() {
        val parsed = MacKeepAwake.parse(
            obj("""{"mode":"timed","active":true,"endsIn":5400000,"power":"low","floor":30}""")
        )
        assertEquals(
            base.copy(
                mode = MacKeepAwake.Mode.Timed,
                active = true,
                endsIn = 5_400_000,
                floor = 30,
                power = MacKeepAwake.Power.Low
            ),
            parsed
        )
        assertNull(MacKeepAwake.parse(obj("""{"mode":"forever"}""")))
        assertNull(MacKeepAwake.parse(obj("""{}""")))
    }

    @Test
    fun countsDownAndSpellsLengths() {
        assertEquals("4:32", MacKeepAwake.clock(272.0))
        assertEquals("0:01", MacKeepAwake.clock(0.2))
        assertEquals("1:29:58", MacKeepAwake.clock(89 * 60 + 58.0))
        assertEquals("45 min", MacKeepAwake.span(45))
        assertEquals("2 h", MacKeepAwake.span(120))
        assertEquals("1 h 30 min", MacKeepAwake.span(90))
        assertEquals("For 30 Minutes", MacKeepAwake.presetTitle(30))
        assertEquals("For 1 Hour", MacKeepAwake.presetTitle(60))
        assertEquals("For 8 Hours", MacKeepAwake.presetTitle(480))
    }

    @Test
    fun badgeNamesTheAgentsThenTheCountdown() {
        assertNull(base.badge(null))
        val working = base.copy(mode = MacKeepAwake.Mode.Agents, active = true, agents = 2)
        assertEquals("2 agents", working.badge(null))
        val tail = base.copy(mode = MacKeepAwake.Mode.Agents, active = true)
        assertEquals("4:59", tail.badge(299.0))
        assertEquals("Agents", base.copy(mode = MacKeepAwake.Mode.Agents).badge(null))
        assertEquals("On", base.copy(mode = MacKeepAwake.Mode.Always, active = true).badge(null))
    }

    @Test
    fun lineSaysWhatHoldsAndForHowLong() {
        assertEquals("Sleeps on its usual schedule.", base.line(null, now, zone))
        assertEquals(
            "2 agents working. Stays awake 5 min after the last one finishes.",
            base.copy(
                mode = MacKeepAwake.Mode.Agents,
                active = true,
                agents = 2
            ).line(null, now, zone)
        )
        assertEquals(
            "Agents finished. Can sleep in 2:05 unless another one starts.",
            base.copy(mode = MacKeepAwake.Mode.Agents, active = true).line(125.0, now, zone)
        )
        assertEquals(
            "No agent is working. Stays awake when the next one starts.",
            base.copy(mode = MacKeepAwake.Mode.Agents).line(null, now, zone)
        )
        val timed = base.copy(mode = MacKeepAwake.Mode.Timed, active = true).line(5400.0, now, zone)
        assertTrue(timed, timed.startsWith("Awake until "))
        assertTrue(timed, timed.endsWith(" · 1 h 30 min left."))
        assertEquals(
            "Awake until you turn it off.",
            base.copy(mode = MacKeepAwake.Mode.Always, active = true).line(null, now, zone)
        )
    }

    @Test
    fun powerNoteExplainsWhyItIsNotHeld() {
        val always = base.copy(mode = MacKeepAwake.Mode.Always)
        assertEquals(
            "Battery at 20% or less, so Studio can sleep.",
            always.copy(power = MacKeepAwake.Power.Low).powerNote("Studio")
        )
        assertNull(always.copy(power = MacKeepAwake.Power.Awake).powerNote("Studio"))
        assertNull(base.copy(power = MacKeepAwake.Power.Battery).powerNote("Studio"))
        assertFalse(always.isOn)
        assertTrue(always.copy(active = true).isOn)
    }
}
