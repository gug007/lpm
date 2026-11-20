package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacVia
import cx.lpm.mobile.core.data.prefs.NotificationPrefs
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.prefs.setNotificationPrefs
import cx.lpm.mobile.core.data.testing.SessionHarness
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.model.obj
import cx.lpm.mobile.core.model.string
import java.util.Base64
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class PushRegistrarTest {
    private fun TestScope.settle(millis: Long = 0) {
        testScheduler.advanceTimeBy(millis)
        testScheduler.runCurrent()
    }

    private fun SessionHarness.registered(localId: String) =
        prefs.string(PreferenceKeys.pushRegistered(localId))

    @Test
    fun theLiveMacIsToldOnReadyAndItsAckRemembered() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.registrar.start()
        val live = h.connectReady()
        settle()

        val frame = live.sentOf("pushToken").single()
        assertEquals("fcm", frame.string("platform"))
        assertEquals("fcm:tok-1", frame.string("token"))
        assertNull(frame["env"])
        assertEquals(32, Base64.getDecoder().decode(frame.string("key")).size)
        val notify = frame.obj("notify")!!
        assertEquals(true, notify.bool("waiting"))
        assertEquals(false, notify.bool("automationStarted"))
        assertEquals(true, notify.bool("weeklyRecap"))
        assertTrue(live.sentOf("apnsToken").isEmpty())

        val id = h.session.state.value.activeMacId!!
        assertNull(h.registered(id))
        live.receive("""{"t":"pushToken","ok":true}""")
        settle()
        assertEquals(h.registrar.registration()?.signature, h.registered(id))
    }

    @Test
    fun nothingGoesOutWithoutATokenOrPermission() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.allowed = false
        h.registrar.start()
        val live = h.connectReady()
        settle(5_000)
        assertTrue(live.sentOf("pushToken").isEmpty())

        h.pushTokens.token.value = "fcm:tok-1"
        settle()
        assertTrue(live.sentOf("pushToken").isEmpty())

        // Allowed in the system dialog, noticed when the app resumes.
        h.pushTokens.allowed = true
        h.registrar.refreshPermission()
        settle()
        assertEquals(1, live.sentOf("pushToken").size)
    }

    @Test
    fun aChangedPreferenceOrTokenIsSentAgain() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.registrar.start()
        val live = h.connectReady()
        settle()
        h.prefs.setNotificationPrefs(NotificationPrefs(waiting = false))
        settle()
        h.pushTokens.token.value = "fcm:tok-2"
        settle()

        val frames = live.sentOf("pushToken")
        assertEquals(3, frames.size)
        assertEquals(false, frames[1].obj("notify")?.bool("waiting"))
        assertEquals("fcm:tok-2", frames[2].string("token"))
        // Push switched off as a whole turns every kind off on the Mac; `generate`
        // says what this app can show, not a kind.
        h.prefs.setNotificationPrefs(NotificationPrefs(enabled = false))
        settle()
        val off = live.sentOf("pushToken").last().obj("notify")!!
        assertTrue(off.filterKeys { it != "generate" }.values.none { it.toString() == "true" })
    }

    @Test
    fun turningTheWeeklyRecapOffTellsTheMacAgain() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.registrar.start()
        val live = h.connectReady()
        settle()
        h.prefs.setNotificationPrefs(NotificationPrefs(weeklyRecap = false))
        settle()

        val frames = live.sentOf("pushToken")
        assertEquals(2, frames.size)
        assertEquals(false, frames[1].obj("notify")?.bool("weeklyRecap"))
        assertEquals(true, frames[1].obj("notify")?.bool("waiting"))
    }

    @Test
    fun otherSavedMacsAreSweptOverThrowawayConnections() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        val live = h.connectReady()
        val other = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = "srv-2",
            name = "Office Mac",
            hosts = listOf("10.0.0.5"),
            port = 8765
        )
        val throughLive = other.copy(
            localId = MacRecord.newLocalId(),
            serverId = "srv-3",
            via = MacVia(h.session.state.value.activeMacId!!, "box")
        )
        h.credentials.save("dev-2", "tok-2", other.localId)
        h.credentials.save("dev-3", "tok-3", throughLive.localId)
        h.prober.reachable += "10.0.0.5"
        h.session.mutableState.update { it.copy(macs = it.macs + other + throughLive) }
        h.registrar.start()
        settle(2_000)

        val sweep = h.transport.last
        assertTrue(sweep !== live)
        sweep.open()
        settle()
        assertEquals("tok-2", sweep.sentOf("auth").single().string("token"))
        sweep.receive("""{"t":"ready","serverId":"srv-2","serverName":"Office Mac.local"}""")
        settle()
        assertEquals("fcm:tok-1", sweep.sentOf("pushToken").single().string("token"))
        sweep.receive("""{"t":"pushToken","ok":true}""")
        settle()

        assertTrue(sweep.closed)
        assertEquals(h.registrar.registration()?.signature, h.registered(other.localId))
        assertNull(h.registered(throughLive.localId))
        assertEquals(
            "Office Mac.local",
            h.session.state.value.macs.single { it.localId == other.localId }.name
        )
        // Nothing left to tell: the next sweep dials no one.
        val dialed = h.transport.sockets.size
        h.registrar.sync()
        settle(2_000)
        assertEquals(dialed, h.transport.sockets.size)
    }

    @Test
    fun aMacOfferingLiveUpdatesIsToldTheChoiceWithEveryRegistration() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.registrar.start()
        val live = h.connectReady(features = listOf("liveActivity"))
        settle()
        assertEquals(true, live.sentOf("liveActivity").single().bool("on"))
        assertNull(live.sentOf("liveActivity").single()["token"])

        h.prefs.setNotificationPrefs(NotificationPrefs(liveActivity = false))
        settle()
        assertEquals(false, live.sentOf("liveActivity").last().bool("on"))
        assertEquals(2, live.sentOf("pushToken").size)
    }

    @Test
    fun aMacWithoutLiveUpdatesHearsNothingOfThem() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.registrar.start()
        val live = h.connectReady()
        settle()
        assertEquals(1, live.sentOf("pushToken").size)
        assertTrue(live.sentOf("liveActivity").isEmpty())
    }

    @Test
    fun theSweepTellsAnotherMacAndWaitsForBothAnswers() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.connectReady()
        val other = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = "srv-2",
            name = "Office Mac",
            hosts = listOf("10.0.0.5"),
            port = 8765
        )
        h.credentials.save("dev-2", "tok-2", other.localId)
        h.prober.reachable += "10.0.0.5"
        h.session.mutableState.update { it.copy(macs = it.macs + other) }
        h.registrar.start()
        settle(2_000)

        val sweep = h.transport.last
        sweep.open()
        settle()
        sweep.receive("""{"t":"ready","serverId":"srv-2","features":["liveActivity"]}""")
        settle()
        assertEquals(true, sweep.sentOf("liveActivity").single().bool("on"))
        sweep.receive("""{"t":"pushToken","ok":true}""")
        settle()
        assertFalse(sweep.closed)
        assertNull(h.registered(other.localId))
        sweep.receive("""{"t":"liveActivity","ok":true}""")
        settle()
        assertTrue(sweep.closed)
        assertEquals(h.registrar.registration()?.signature, h.registered(other.localId))

        // Switching live updates off is news to every Mac.
        h.prefs.setNotificationPrefs(NotificationPrefs(liveActivity = false))
        settle(2_000)
        val again = h.transport.last
        assertTrue(again !== sweep)
        again.open()
        settle()
        again.receive("""{"t":"ready","serverId":"srv-2","features":["liveActivity"]}""")
        settle()
        assertEquals(false, again.sentOf("liveActivity").single().bool("on"))
    }

    @Test
    fun anUnreachableMacIsLeftForTheNextSweep() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.connectReady()
        val other = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = "srv-2",
            name = "Office Mac",
            hosts = listOf("10.0.0.5"),
            port = 8765
        )
        h.credentials.save("dev-2", "tok-2", other.localId)
        val sockets = h.transport.sockets.size
        h.session.mutableState.update { it.copy(macs = it.macs + other) }
        h.registrar.start()
        settle(2_000)
        assertEquals(sockets, h.transport.sockets.size)
        assertNull(h.registered(other.localId))
        assertFalse(h.prober.probed.isEmpty())
    }

    @Test
    fun demoModeRegistersNothing() = runTest {
        val h = SessionHarness(this)
        h.pushTokens.token.value = "fcm:tok-1"
        h.registrar.start()
        h.session.enterDemo()
        settle(5_000)
        assertTrue(h.transport.sockets.isEmpty())
        val demoId = h.session.state.value.activeMacId!!
        assertNull(h.registered(demoId))
    }
}
