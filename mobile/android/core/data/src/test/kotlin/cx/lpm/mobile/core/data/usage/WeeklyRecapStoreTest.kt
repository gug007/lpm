package cx.lpm.mobile.core.data.usage

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.data.testing.settleAlive
import cx.lpm.mobile.core.model.RecapPeriod
import cx.lpm.mobile.core.model.RecapPick
import cx.lpm.mobile.core.model.RecapWeek
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.string
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private val LastWeek = RecapPick(RecapWeek.Last, RecapPeriod.Week)
private val ThisWeek = RecapPick(RecapWeek.This, RecapPeriod.Week)
private val LastMonth = RecapPick(RecapWeek.Last, RecapPeriod.Month)

@OptIn(ExperimentalCoroutinesApi::class)
class WeeklyRecapStoreTest {
    private fun recap(week: String, sessions: Int = 58, period: String = "week") =
        """{"t":"weeklyRecap","ok":true,"week":"$week","period":"$period",""" +
            """"recap":{"week":"2026-10-05","sessions":$sessions,""" +
            """"days":[{"date":"2026-10-05","agentMs":60000,"prompts":1}]}}"""

    @Test
    fun `only a Mac that says so offers the recap`() = runTest {
        assertFalse(
            SessionHarness(this).apply {
                connectReady()
            }.session.store<WeeklyRecapStore>().available
        )
        val h = SessionHarness(this)
        h.connectReady(features = listOf(LpmClient.WEEKLY_RECAP_FEATURE))
        assertTrue(h.session.store<WeeklyRecapStore>().available)
        assertFalse(h.session.store<WeeklyRecapStore>().monthAvailable)
        val months = SessionHarness(this)
        months.connectReady(
            features = listOf(LpmClient.WEEKLY_RECAP_FEATURE, LpmClient.RECAP_MONTH_FEATURE)
        )
        assertTrue(months.session.store<WeeklyRecapStore>().monthAvailable)
    }

    @Test
    fun `a month goes out as one and lands apart from the week`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<WeeklyRecapStore>()
        store.load()
        assertNull(socket.sentOf("weeklyRecap").last().string("period"))
        store.select(LastMonth)
        assertEquals("month", socket.sentOf("weeklyRecap").last().string("period"))
        assertEquals("last", socket.sentOf("weeklyRecap").last().string("week"))

        socket.receive(recap("last", sessions = 240, period = "month"))
        settleAlive(socket, 0)
        assertEquals(240L, store.state.value.recaps[LastMonth]?.sessions)
        assertNull(store.state.value.recaps[LastWeek])
        assertEquals(setOf(LastWeek), store.state.value.loading)

        socket.receive("""{"t":"weeklyRecap","ok":false,"week":"this","period":"month"}""")
        settleAlive(socket, 0)
        assertEquals(
            "Couldn't read the month.",
            store.state.value.errors[RecapPick(RecapWeek.This, RecapPeriod.Month)]
        )
    }

    @Test
    fun `each week lands on its own and fresh goes out only on a refresh`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<WeeklyRecapStore>()
        store.load()
        assertEquals("last", socket.sentOf("weeklyRecap").last().string("week"))
        assertNull(socket.sentOf("weeklyRecap").last().bool("fresh"))

        store.select(ThisWeek)
        socket.receive(recap("last", sessions = 3))
        settleAlive(socket, 0)
        assertEquals(3L, store.state.value.recaps[LastWeek]?.sessions)
        assertEquals(setOf(ThisWeek), store.state.value.loading)
        assertEquals(ThisWeek, store.state.value.pick)

        socket.receive(recap("this"))
        settleAlive(socket, 0)
        assertEquals(58L, store.state.value.recaps[ThisWeek]?.sessions)
        assertTrue(store.state.value.loading.isEmpty())

        store.refresh()
        assertEquals("this", socket.sentOf("weeklyRecap").last().string("week"))
        assertEquals(true, socket.sentOf("weeklyRecap").last().bool("fresh"))
    }

    @Test
    fun `a week that never answers fails after 30 seconds, one on screen just stops`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<WeeklyRecapStore>()
        store.load()
        settleAlive(socket, 30_000)
        assertTrue(store.state.value.loading.isEmpty())
        assertEquals("The Mac didn't answer.", store.state.value.errors[LastWeek])

        store.load()
        assertNull(store.state.value.errors[LastWeek])
        socket.receive(recap("last"))
        settleAlive(socket, 0)
        store.load()
        settleAlive(socket, 30_000)
        assertTrue(store.state.value.loading.isEmpty())
        assertNull(store.state.value.errors[LastWeek])
    }

    @Test
    fun `a refusal says why for the week it names, last week when it names none`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<WeeklyRecapStore>()
        store.select(ThisWeek)
        socket.receive("""{"t":"weeklyRecap","ok":false,"week":"this","error":"No history"}""")
        settleAlive(socket, 0)
        assertEquals(mapOf(ThisWeek to "No history"), store.state.value.errors)
        assertTrue(store.state.value.loading.isEmpty())

        socket.receive("""{"t":"weeklyRecap","ok":false}""")
        settleAlive(socket, 0)
        assertEquals("Couldn't read the week.", store.state.value.errors[LastWeek])
    }

    @Test
    fun `the screen opens on last week and a dropped link asks again`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<WeeklyRecapStore>()
        store.select(ThisWeek)
        store.screenDidOpen()
        assertEquals(LastWeek, store.state.value.pick)
        assertEquals("last", socket.sentOf("weeklyRecap").last().string("week"))
        socket.receive(recap("this"))
        settleAlive(socket, 0)

        socket.fail()
        settleAlive(socket, 0)
        assertEquals(setOf(LastWeek), store.state.value.loading)
        assertEquals(58L, store.state.value.recaps[ThisWeek]?.sessions)
    }

    @Test
    fun `a dropped link only drops a closed screen's spinner`() = runTest {
        val h = SessionHarness(this)
        val socket = h.connectReady()
        val store = h.session.store<WeeklyRecapStore>()
        store.screenDidOpen()
        store.screenDidClose()
        socket.fail()
        settleAlive(socket, 0)
        assertTrue(store.state.value.loading.isEmpty())
    }
}
