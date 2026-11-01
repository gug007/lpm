package cx.lpm.mobile.core.data.link

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * Picks a reachable address for the Mac from its candidates (LAN IP, Tailscale IP,
 * names) by racing an actual WebSocket open against each — the same transport and
 * certificate pinning the live connection uses — so the phone lands on the LAN
 * address at home and the Tailscale one away, with no fixed ordering penalty.
 */
interface HostProber {
    /** One host's result, with a short reason for the address list ("refused"). */
    data class Outcome(val host: String, val reachable: Boolean, val detail: String)

    data class Race(val winner: String?, val outcomes: List<Outcome>)

    /**
     * Whose certificate to expect: the Mac's stored pin, or while pairing the QR's
     * fingerprint; neither is trust on first use, as on the live link. A certificate
     * that doesn't match still counts as reachable — the Mac answered — and the live
     * connection is what reports the changed identity.
     */
    data class Identity(val pin: String? = null, val expected: String? = null) {
        companion object {
            val FirstUse = Identity()
        }
    }

    /** Probe one host: reachable once the WebSocket upgrade answers. */
    suspend fun open(
        host: String,
        port: Int,
        identity: Identity,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS
    ): Outcome

    /**
     * The first reachable host (the rest are cancelled) plus the outcomes gathered
     * so far; a single candidate skips the probe — the live connection will try it.
     */
    suspend fun race(
        hosts: List<String>,
        port: Int,
        identity: Identity,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS
    ): Race {
        val candidates = hosts.filter { it.isNotEmpty() }
        if (candidates.size <= 1) return Race(candidates.firstOrNull(), emptyList())
        return coroutineScope {
            val results = Channel<Outcome>(Channel.UNLIMITED)
            val probes = candidates.map { host ->
                launch { results.send(open(host, port, identity, timeoutMs)) }
            }
            val outcomes = mutableListOf<Outcome>()
            repeat(candidates.size) {
                val outcome = results.receive()
                outcomes += outcome
                if (outcome.reachable) {
                    probes.forEach { it.cancel() }
                    return@coroutineScope Race(outcome.host, outcomes)
                }
            }
            Race(null, outcomes)
        }
    }

    /** The first address that answers — probing even a lone one, which [race] doesn't. */
    suspend fun firstReachable(
        hosts: List<String>,
        port: Int,
        identity: Identity,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS
    ): String? {
        val candidates = hosts.filter { it.isNotEmpty() }
        if (candidates.size == 1) {
            return candidates[0].takeIf { open(it, port, identity, timeoutMs).reachable }
        }
        return race(candidates, port, identity, timeoutMs).winner
    }

    /** Whether any address answers, as [firstReachable] finds it. */
    suspend fun anyReachable(
        hosts: List<String>,
        port: Int,
        identity: Identity,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS
    ): Boolean = firstReachable(hosts, port, identity, timeoutMs) != null

    /** Check every address and report each one, for the address list. */
    suspend fun checkAll(
        hosts: List<String>,
        port: Int,
        identity: Identity,
        timeoutMs: Long = DEFAULT_TIMEOUT_MS
    ): List<Outcome> = coroutineScope {
        val results = Channel<Outcome>(Channel.UNLIMITED)
        val candidates = hosts.filter { it.isNotEmpty() }
        candidates.forEach { host ->
            launch { results.send(open(host, port, identity, timeoutMs)) }
        }
        List(candidates.size) { results.receive() }
    }

    companion object {
        const val DEFAULT_TIMEOUT_MS = 6_000L
    }
}
