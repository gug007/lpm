package cx.lpm.mobile.core.data.share

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.send
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/**
 * A one-off link to a paired Mac for a share (iOS `ShareMacLink`): the app's own
 * client, so the pin and built-in Tailscale apply as on the live link. It trades a
 * few frames, reading each reply as it arrives and skipping whatever else the Mac
 * pushes, and counts the link as gone once it drops after `ready` or fails.
 */
internal class ShareLink(private val client: LpmClient) {
    private val frames = Channel<JsonObject>(Channel.UNLIMITED)
    private var ready = false

    init {
        client.onFrameText = { text -> parse(text)?.let(frames::trySend) }
        client.onState = { state ->
            when (state) {
                LpmClient.State.Ready -> ready = true
                is LpmClient.State.Failed -> frames.close()
                else -> if (ready) frames.close()
            }
        }
    }

    fun connect() = client.connect()

    fun send(frame: String) = client.send(frame)

    /**
     * The next frame [matches] accepts, or null once the link is gone or has said
     * nothing it accepts for [timeoutMs].
     */
    suspend fun reply(timeoutMs: Long = REPLY_MS, matches: (JsonObject) -> Boolean): JsonObject? =
        withTimeoutOrNull(timeoutMs) { next(matches) }

    fun close() {
        // Dropped first: shutting down reports `Idle` to a link nobody reads any more.
        client.onState = null
        client.onFrameText = null
        client.shutdown()
        frames.close()
    }

    private suspend fun next(matches: (JsonObject) -> Boolean): JsonObject? {
        while (true) {
            val frame = frames.receiveCatching().getOrNull() ?: return null
            if (matches(frame)) return frame
        }
    }

    private fun parse(text: String): JsonObject? = try {
        Json.parseToJsonElement(text) as? JsonObject
    } catch (e: SerializationException) {
        null
    }

    private companion object {
        const val REPLY_MS = 30_000L
    }
}
