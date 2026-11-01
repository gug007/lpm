package cx.lpm.mobile.core.data.push

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.LpmClientFactory
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.mac.CredentialStore
import cx.lpm.mobile.core.data.mac.MacRecord
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/**
 * One short-lived connection to a saved Mac other than the live one (iOS
 * `PushRegistrar.Attempt`): probes its addresses, dials the one that answers, runs
 * one exchange once the session is ready, and resolves once — on the exchange's
 * result, on a terminal failure, or when the time runs out — hanging up on the way
 * out. It subscribes to nothing and is never handed to the session.
 */
internal class MacErrand(
    private val clients: LpmClientFactory,
    private val prober: HostProber,
    private val credentials: CredentialStore,
    private val deviceName: String
) {
    /**
     * `exchange` sends on the ready client and calls `done` with the outcome. Null
     * covers unreachable, refused and timed out alike.
     */
    suspend fun <T : Any> run(
        mac: MacRecord,
        timeoutMs: Long,
        onIdentity: (serverId: String?, serverName: String?, platform: String?) -> Unit =
            { _, _, _ -> },
        exchange: (client: LpmClient, done: (T) -> Unit) -> Unit
    ): T? {
        val credential = credentials.load(mac.localId) ?: return null
        val host = reach(mac) ?: return null
        val result = CompletableDeferred<T?>()
        val c = clients.create(
            LpmClient.Endpoint(host, mac.port),
            credential,
            deviceName,
            pinProvider = { credentials.loadPin(mac.localId) }
        )
        var started = false
        c.onState = { state ->
            when (state) {
                LpmClient.State.Ready -> if (!started) {
                    started = true
                    exchange(c) { result.complete(it) }
                }

                is LpmClient.State.Failed -> result.complete(null)

                else -> Unit
            }
        }
        c.onIdentity = onIdentity
        return try {
            c.connect()
            withTimeoutOrNull(timeoutMs) { result.await() }
        } finally {
            // Dropped first: shutting down reports `Idle` to a dead errand otherwise.
            c.onState = null
            c.onIdentity = null
            c.shutdown()
        }
    }

    private suspend fun reach(mac: MacRecord): String? = prober.firstReachable(
        mac.hosts,
        mac.port,
        HostProber.Identity(pin = credentials.loadPin(mac.localId))
    )
}
