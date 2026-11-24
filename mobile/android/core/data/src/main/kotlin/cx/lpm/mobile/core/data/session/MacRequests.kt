package cx.lpm.mobile.core.data.session

import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/** Requests the Mac answers by their `reqId`. */
internal class MacRequests<T : Any>(private val timeoutMs: Long) {
    private val waiting = mutableMapOf<String, CompletableDeferred<T?>>()

    /** The answer to what [send] sends; null when none comes or the connection drops. */
    suspend fun request(send: (reqId: String) -> Unit): T? {
        val reqId = UUID.randomUUID().toString()
        val reply = CompletableDeferred<T?>()
        waiting[reqId] = reply
        return try {
            send(reqId)
            withTimeoutOrNull(timeoutMs) { reply.await() }
        } finally {
            waiting -= reqId
        }
    }

    fun deliver(reqId: String, reply: T?) {
        waiting.remove(reqId)?.complete(reply)
    }

    fun failAll() {
        waiting.values.forEach { it.complete(null) }
        waiting.clear()
    }
}
