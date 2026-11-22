package cx.lpm.mobile.feature.mac.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.bool
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.mac.settle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PowerStoreTest {
    private val TestSession.power: PowerStore get() = store()

    private fun session(scope: kotlinx.coroutines.test.TestScope) =
        TestSession(scope, setOf(SessionStore.Factory(::PowerStore)))

    @Test
    fun `a Mac that offers it is asked what it can do`() = runTest {
        val t = session(this)
        val socket = t.connectReady(features = listOf(LpmClient.POWER_FEATURE))
        t.settle()
        assertEquals(1, socket.sentOf("power").size)
        socket.receive(
            """{"t":"power","state":{"lock":true,"sleep":true,"armed":false,"agents":2,"automations":1}}"""
        )
        t.settle()
        val power = t.power.state.value.power!!
        assertTrue(power.offered)
        assertEquals("2 agents and 1 automation working", power.workingLine)
    }

    @Test
    fun `an older Mac offers nothing`() = runTest {
        val t = session(this)
        val socket = t.connectReady(features = emptyList())
        t.settle()
        assertTrue(socket.sentOf("power").isEmpty())
        assertNull(t.power.state.value.power)
    }

    @Test
    fun `sleep now waits for the person to confirm`() = runTest {
        val t = session(this)
        val socket = t.connectReady(features = listOf(LpmClient.POWER_FEATURE))
        t.power.askToSleep()
        t.settle()
        assertTrue(t.power.state.value.confirmingSleep)
        assertTrue(socket.sentOf("sleepNow").isEmpty())

        t.power.sleepNow()
        t.settle()
        assertFalse(t.power.state.value.confirmingSleep)
        assertEquals(1, socket.sentOf("sleepNow").size)
    }

    @Test
    fun `a refusal shows and the state it carries applies`() = runTest {
        val t = session(this)
        val socket = t.connectReady(features = listOf(LpmClient.POWER_FEATURE))
        t.power.sleepWhenIdle(true)
        t.settle()
        assertEquals(true, socket.sentOf("sleepWhenIdle").single().bool("on"))
        socket.receive(
            """{"t":"sleepWhenIdle","ok":false,"error":"Nothing is working.",""" +
                """"state":{"lock":true,"sleep":true,"armed":false,"agents":0,"automations":0}}"""
        )
        t.settle()
        assertEquals("Nothing is working.", t.session.alerts.alerts.value.actionError)
        assertFalse(t.power.state.value.power!!.working)
    }
}
