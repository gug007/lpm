package cx.lpm.mobile.core.data.session

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class MacRequestsTest {
    @Test
    fun `a reply goes to the request that carries its id`() = runTest {
        val requests = MacRequests<String>(TIMEOUT_MS)
        var id = ""
        val answer = async { requests.ask { id = it } }
        runCurrent()
        requests.deliver("another", "no")
        requests.deliver(id, "yes")
        assertEquals(MacAnswer.Reply("yes"), answer.await())
    }

    @Test
    fun `an answer that never came is told from a link that dropped`() = runTest {
        val requests = MacRequests<String>(TIMEOUT_MS)
        val late = async { requests.ask {} }
        advanceTimeBy(TIMEOUT_MS)
        runCurrent()
        assertEquals(MacAnswer.None(MacRequestError.TimedOut), late.await())

        val dropped = async { requests.ask {} }
        runCurrent()
        requests.failAll()
        assertEquals(MacAnswer.None(MacRequestError.Disconnected), dropped.await())
    }

    @Test
    fun `request reads either as no reply`() = runTest {
        val requests = MacRequests<String>(TIMEOUT_MS)
        val late = async { requests.request {} }
        advanceTimeBy(TIMEOUT_MS)
        runCurrent()
        assertNull(late.await())

        val dropped = async { requests.request {} }
        runCurrent()
        requests.failAll()
        assertNull(dropped.await())
    }

    private companion object {
        const val TIMEOUT_MS = 1_000L
    }
}
