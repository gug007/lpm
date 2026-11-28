package cx.lpm.mobile.core.data.session

import java.util.UUID
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/** Why a request got no reply, in words to show (iOS `MacRequestError`). */
internal enum class MacRequestError(val message: String) {
    TimedOut("The Mac didn't answer in time."),
    Disconnected("Lost the connection to the Mac.")
}

/** A request's reply, or why there is none. */
internal sealed interface MacAnswer<out T> {
    data class Reply<T>(val value: T) : MacAnswer<T>

    data class None(val why: MacRequestError) : MacAnswer<Nothing>
}

/** Requests the Mac answers by their `reqId`. */
internal class MacRequests<T : Any>(private val timeoutMs: Long) {
    private val waiting = mutableMapOf<String, CompletableDeferred<T?>>()

    /** The answer to what [send] sends; null when none comes or the connection drops. */
    suspend fun request(send: (reqId: String) -> Unit): T? = (ask(send) as? MacAnswer.Reply)?.value

    /** As [request], telling an answer that never came from a connection that dropped. */
    suspend fun ask(send: (reqId: String) -> Unit): MacAnswer<T> {
        val reqId = UUID.randomUUID().toString()
        val reply = CompletableDeferred<T?>()
        waiting[reqId] = reply
        return try {
            send(reqId)
            val value = withTimeoutOrNull(timeoutMs) { reply.await() }
            when {
                value != null -> MacAnswer.Reply(value)
                reply.isCompleted -> MacAnswer.None(MacRequestError.Disconnected)
                else -> MacAnswer.None(MacRequestError.TimedOut)
            }
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
