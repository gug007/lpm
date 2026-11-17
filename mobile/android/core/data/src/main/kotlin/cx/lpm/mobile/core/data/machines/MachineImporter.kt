package cx.lpm.mobile.core.data.machines

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestMachinePair
import cx.lpm.mobile.core.data.client.requestMachines
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.data.session.AdoptedMachine
import cx.lpm.mobile.core.data.session.MacSession
import cx.lpm.mobile.core.data.session.SessionStore
import cx.lpm.mobile.core.model.MachinePairOffer
import cx.lpm.mobile.core.model.RemoteMachine
import cx.lpm.mobile.core.model.asStringMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Adds the live Mac's own machines — its Linux servers and other Macs — to this
 * phone, so nobody has to scan a code per machine (iOS `MachineImporter`).
 *
 * The Mac lists them (`machines`); for each one the phone doesn't have yet, the Mac
 * asks that machine to arm a pairing code (`machinePair`), and the phone pairs with
 * it directly over a throwaway connection. The result is an ordinary saved machine
 * the phone reaches on its own, with the Mac asleep. A machine the user removed is
 * never re-added on its own, nor is one that removed this phone: only pairing on it
 * lets the phone back in. A failure isn't retried automatically for ten minutes, so
 * an unreachable server doesn't get a fresh code on every reconnect.
 */
class MachineImporter(private val session: MacSession) : SessionStore {
    private val mutable = MutableStateFlow(MachineImportState())
    val state: StateFlow<MachineImportState> = mutable.asStateFlow()

    /** The live Mac's connected machines with their projects, as the projects list shows them. */
    val sections: Flow<List<MachineSection>> =
        combine(session.state, state, ::machineSections).distinctUntilChanged()

    private val prefs get() = session.preferences
    private val clock get() = session.env.clock
    private var generation = 0
    private val queue = ArrayDeque<String>()
    private var running = false
    private val offerWaiters = mutableMapOf<String, CompletableDeferred<OfferResult>>()
    private var relists = 0

    private sealed interface OfferResult {
        data class Offer(val offer: MachinePairOffer) : OfferResult

        data class Failed(val message: String) : OfferResult
    }

    override fun wire(client: LpmClient) {
        // A visited machine's own machines are never added here.
        if (session.isVisit) return
        client.onMachines = { machines ->
            val source = session.state.value.activeRecord?.serverId
            if (client === session.client && !session.state.value.demoMode && source != null) {
                update(machines, source)
            }
        }
        client.onMachinePair = { slug, offer, error ->
            if (client === session.client) receiveOffer(slug, offer, error)
        }
    }

    override fun reset() = detach()

    /** One section, as it stands now. */
    fun section(slug: String): MachineSection? =
        machineSections(session.state.value, state.value).firstOrNull { it.id == slug }

    /** The live Mac (`source` is its serverId) listed its machines: add every new one. */
    fun update(list: List<RemoteMachine>, source: String) {
        if (source != state.value.sourceId) detach()
        mutable.update {
            it.copy(
                sourceId = source,
                machines = list,
                ledger = readLedger(),
                revoked = readRevoked()
            )
        }
        val macs = session.state.value.macs
        // Paired on the machine itself since: whatever it refused before is over.
        forgetRevoked(
            list.filter { state.value.isOnPhone(it, source, macs) }
                .map { MachineImportState.key(source, it.slug) }
        )
        for (m in list) {
            if (m.state == RemoteMachine.State.Ready && shouldAdd(m, source)) enqueue(m.slug)
        }
        val waiting = list.any {
            it.state == RemoteMachine.State.Offline && !state.value.isOnPhone(it, source, macs)
        }
        if (waiting && relists < MAX_RELISTS) {
            relists += 1
            val gen = generation
            session.scope.launch {
                delay(RELIST_DELAY_MS)
                if (generation == gen) requestMachines()
            }
        }
    }

    /** Add one machine now — a retry after a failure, or one the user removed. */
    fun add(slug: String) {
        val source = state.value.sourceId ?: return
        mutable.update { it.copy(failures = it.failures - MachineImportState.key(source, slug)) }
        enqueue(slug)
    }

    /**
     * Pair with a machine this phone only opens through the live Mac, so it gets a
     * connection of its own. Not while a try failed lately, nor on a machine that
     * removed this phone.
     */
    fun pairDirectly(slug: String) {
        val s = state.value
        val key = MachineImportState.key(s.sourceId ?: return, slug)
        if (key in s.revoked) return
        val failure = s.failures[key]
        if (failure != null && clock.millis() - failure.at.toEpochMilli() < RETRY_AFTER_MS) return
        enqueue(slug)
    }

    /** Open a machine in place of the live Mac, saving its entry through the Mac first. */
    fun switchTo(section: MachineSection) {
        val record = section.record
            ?: session.recordThroughLiveMac(section.machine, saving = true)
            ?: return
        session.switchTo(record)
    }

    fun receiveOffer(slug: String, offer: MachinePairOffer?, error: String?) {
        val result = offer?.let(OfferResult::Offer) ?: OfferResult.Failed(offerFailure(error))
        offerWaiters.remove(slug)?.complete(result)
    }

    /**
     * The live Mac went away (switched, removed, or reset). Forget its list; a pairing
     * already under way still finishes and is saved.
     */
    fun detach() {
        generation += 1
        mutable.update { it.copy(sourceId = null, machines = emptyList(), adding = emptySet()) }
        queue.clear()
        relists = 0
        val waiters = offerWaiters.values.toList()
        offerWaiters.clear()
        waiters.forEach { it.complete(OfferResult.Failed(LOST_MAC)) }
    }

    private fun requestMachines() {
        if (session.state.value.isReady) session.client?.requestMachines()
    }

    private fun shouldAdd(m: RemoteMachine, source: String): Boolean {
        val s = state.value
        val macs = session.state.value.macs
        if (s.isOnPhone(m, source, macs) || s.wasRemoved(m, source, macs)) return false
        if (m.slug in s.adding || MachineImportState.key(source, m.slug) in s.revoked) return false
        val failure = s.failures[MachineImportState.key(source, m.slug)]
        return failure == null ||
            clock.millis() - failure.at.toEpochMilli() >= RETRY_AFTER_MS
    }

    private fun enqueue(slug: String) {
        if (slug in state.value.adding) return
        mutable.update { it.copy(adding = it.adding + slug) }
        queue.addLast(slug)
        if (running) return
        running = true
        session.scope.launch {
            while (queue.isNotEmpty()) addOne(queue.removeFirst())
            running = false
        }
    }

    private suspend fun addOne(slug: String) {
        val source = state.value.sourceId ?: return
        val gen = generation
        when (val outcome = pair(slug)) {
            is Outcome.Success -> save(outcome.machine, source, slug)

            Outcome.Revoked -> writeRevoked(
                state.value.revoked + MachineImportState.key(source, slug)
            )

            // Leaving the Mac mid-way is not the machine's failure; retry it on return.
            is Outcome.Failure -> if (generation == gen) {
                val key = MachineImportState.key(source, slug)
                val failure = MachineImportFailure(clock.instant(), outcome.message)
                mutable.update { it.copy(failures = it.failures + (key to failure)) }
            }
        }
        if (generation == gen) mutable.update { it.copy(adding = it.adding - slug) }
    }

    private fun save(machine: AdoptedMachine, source: String, slug: String) {
        val id = session.adoptMachine(machine)
        val ledger = readLedger() + (MachineImportState.key(source, slug) to id)
        prefs.setString(
            PreferenceKeys.MACHINE_IMPORTS,
            JsonObject(ledger.mapValues { JsonPrimitive(it.value) }).toString()
        )
        mutable.update { it.copy(ledger = ledger) }
    }

    private sealed interface Outcome {
        data class Success(val machine: AdoptedMachine) : Outcome

        data object Revoked : Outcome

        data class Failure(val message: String) : Outcome
    }

    private suspend fun pair(slug: String): Outcome {
        val offer = when (val result = fetchOffer(slug)) {
            is OfferResult.Offer -> result.offer
            is OfferResult.Failed -> return Outcome.Failure(result.message)
        }
        if (offer.hosts.isEmpty()) return Outcome.Failure(NO_ADDRESS)
        val host = session.env.prober.race(offer.hosts, offer.port, HostProber.Identity.FirstUse)
            .winner ?: return Outcome.Failure(unreachable(offer.port))
        val attempt = MachinePairAttempt(session.env.clients, session.env.device.name)
        val result = attempt.pair(host, offer.port, offer.code, offer.fingerprint, PAIR_TIMEOUT_MS)
        return when (result) {
            is MachinePairAttempt.Outcome.Failed -> if (result.reason == LpmClient.REVOKED_ERROR) {
                Outcome.Revoked
            } else {
                Outcome.Failure(pairFailure(result.reason, offer.port))
            }

            is MachinePairAttempt.Outcome.Paired -> {
                val p = result.pairing
                Outcome.Success(
                    AdoptedMachine(
                        serverId = p.serverId ?: offer.serverId,
                        serverName = p.serverName,
                        label = offer.name,
                        hosts = (listOf(host) + offer.hosts + p.hosts).distinct(),
                        port = offer.port.coerceIn(0, MAX_PORT),
                        platform = p.platform ?: offer.platform,
                        deviceId = p.deviceId,
                        token = p.token,
                        fingerprint = p.fingerprint ?: offer.fingerprint
                    )
                )
            }
        }
    }

    private suspend fun fetchOffer(slug: String): OfferResult {
        val client = session.client
        if (client == null || !session.state.value.isReady) return OfferResult.Failed(NOT_CONNECTED)
        client.requestMachinePair(slug)
        val waiter = CompletableDeferred<OfferResult>()
        offerWaiters[slug] = waiter
        val result = withTimeoutOrNull(OFFER_TIMEOUT_MS) { waiter.await() }
        if (offerWaiters[slug] === waiter) offerWaiters.remove(slug)
        return result ?: OfferResult.Failed(NO_ANSWER)
    }

    private fun readLedger(): Map<String, String> {
        val raw = prefs.string(PreferenceKeys.MACHINE_IMPORTS) ?: return emptyMap()
        return runCatching { Json.parseToJsonElement(raw) }.getOrNull().asStringMap().orEmpty()
    }

    private fun readRevoked(): Set<String> {
        val raw = prefs.string(PreferenceKeys.MACHINE_IMPORTS_REVOKED) ?: return emptySet()
        val list = runCatching { Json.parseToJsonElement(raw) as? JsonArray }.getOrNull()
        return list.orEmpty().mapNotNull { (it as? JsonPrimitive)?.contentOrNull }.toSet()
    }

    private fun forgetRevoked(keys: List<String>) {
        val revoked = state.value.revoked
        val kept = revoked - keys.toSet()
        if (kept.size != revoked.size) writeRevoked(kept)
    }

    private fun writeRevoked(keys: Set<String>) {
        prefs.setString(
            PreferenceKeys.MACHINE_IMPORTS_REVOKED,
            JsonArray(keys.sorted().map(::JsonPrimitive)).toString()
        )
        mutable.update { it.copy(revoked = keys) }
    }

    internal companion object {
        const val RETRY_AFTER_MS = 10 * 60_000L
        const val OFFER_TIMEOUT_MS = 30_000L
        const val PAIR_TIMEOUT_MS = 25_000L
        const val RELIST_DELAY_MS = 30_000L
        const val MAX_RELISTS = 3
        private const val MAX_PORT = 65_535

        const val NOT_CONNECTED = "Not connected to the Mac."
        const val NO_ANSWER = "It didn't answer in time."
        const val LOST_MAC = "Lost the connection to the Mac."
        const val NO_ADDRESS = "The Mac doesn't know an address for it."

        fun offerFailure(error: String?): String {
            val e = error.orEmpty().lowercase()
            return when {
                "not connected" in e || "no longer connected" in e ->
                    "The Mac isn't connected to it right now."

                "timed out" in e -> NO_ANSWER

                "update" in e -> "Update lpm on it first."

                else -> "Couldn't get a pairing code from it."
            }
        }

        fun unreachable(port: Int): String = "This phone can't reach it on port $port."

        fun pairFailure(reason: String, port: Int): String = when (reason) {
            LpmClient.PAIR_MISMATCH_ERROR -> "Its identity didn't match. Try again."
            LpmClient.PAIRING_REJECTED_ERROR -> "Its pairing code expired. Try again."
            LpmClient.PAIRING_UNAVAILABLE_ERROR -> "It couldn't save this phone. Check lpm on it."
            else -> unreachable(port)
        }
    }
}
