package cx.lpm.mobile.feature.mac.data

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.MacKeepAwake
import cx.lpm.mobile.core.model.int
import cx.lpm.mobile.core.model.string
import cx.lpm.mobile.core.testing.TestSession
import cx.lpm.mobile.feature.mac.settle
import java.time.Clock
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class KeepAwakeStoreTest {
    private val TestSession.keepAwake: KeepAwakeStore get() = store()

    @Test
    fun `adding time asks the Mac to extend and clears the last error`() = runTest {
        val t = TestSession(
            this,
            setOf(SessionStore.Factory { KeepAwakeStore(it, Clock.systemUTC()) })
        )
        val socket = t.connectReady(features = listOf(LpmClient.KEEP_AWAKE_FEATURE))
        socket.receive(
            """{"t":"keepAwakeSet","ok":false,"error":"Nope.",""" +
                """"state":{"mode":"timed","active":true,"endsIn":600000}}"""
        )
        t.settle()
        assertEquals("Nope.", t.keepAwake.state.value.error)
        assertEquals(MacKeepAwake.Mode.Timed, t.keepAwake.state.value.keepAwake?.mode)

        t.keepAwake.extend(60)
        t.settle()
        val sent = socket.sentOf("keepAwakeSet").single()
        assertEquals("extend", sent.string("mode"))
        assertEquals(60, sent.int("minutes"))
        assertNull(t.keepAwake.state.value.error)
    }
}
