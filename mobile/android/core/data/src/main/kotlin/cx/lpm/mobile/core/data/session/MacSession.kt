package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.link.Hosts
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.link.LinkStore
import cx.lpm.mobile.core.data.link.NetworkMonitor
import cx.lpm.mobile.core.data.link.ReconnectReason
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.prefs.AppPreferences
import cx.lpm.mobile.core.demo.DemoServer
import cx.lpm.mobile.core.model.DEFAULT_MAC_PORT
import cx.lpm.mobile.core.model.RemoteMachine
import cx.lpm.mobile.core.model.SessionKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The session with the active Mac (iOS `AppModel`'s core): the connection, the
 * saved Macs, pairing, identity, Demo Mode and the machine visit. It owns the
 * [LpmClient], wires each new one into its [SessionStore]s and resets them when it
 * starts over. Everything runs on the main thread.
 *
 * The live session is a singleton; a machine opened through it gets a session of
 * its own ([visitSession]) with its own stores, which saves nothing to this phone.
 */
class MacSession internal constructor(
    internal val env: SessionEnvironment,
    private val visitHost: MacSession?,
    /** How screens and navigation keys name this session ([MacSessions]). */
    val key: SessionKey = SessionKey.Live
) {
    internal val mutableState = MutableStateFlow(SessionState())
    val state: StateFlow<SessionState> = mutableState.asStateFlow()

    private val mutableClient = MutableStateFlow<LpmClient?>(null)
    val clientFlow: StateFlow<LpmClient?> = mutableClient.asStateFlow()

    /** The live client, or null between sessions. Stores send through it. */
    var client: LpmClient?
        get() = mutableClient.value
        internal set(value) {
            mutableClient.value = value
        }

    val alerts = SessionAlerts()
    val link = LinkStore(this, env)

    internal val visitFlow = MutableStateFlow<MacSession?>(null)

    /** The machine opened from the projects list, while its screens are open. */
    val visitSession: StateFlow<MacSession?> = visitFlow.asStateFlow()

    /** A session that opens one of the live Mac's machines; it saves nothing. */
    val isVisit: Boolean get() = visitHost != null

    /** Where stores run their timers and requests. */
    val scope: CoroutineScope get() = env.scope

    val preferences: AppPreferences get() = env.prefs

    internal var inForeground = true

    // The address the live client was built for, so migration only rebuilds when a
    // different one becomes reachable.
    internal var currentHost: String? = null

    // Bumped by every new address probe and by a reset, so a probe that was
    // overtaken never dials.
    internal var probeGeneration = 0

    var probing = false
        internal set

    internal val pairing = Pairing(this)
    internal val savedMacs = SavedMacs(this)
    internal val upkeep = LinkUpkeep(this)
    internal val wake = MacWake(this)
    internal val recovery = EndpointRecovery(this)
    internal val visits = Visits(this, visitHost)
    private val wiring = ConnectionWiring(this)

    /** This session's stores, one per area, built from the contributed factories. */
    val stores: List<SessionStore> = env.storeFactories.map { it.create(this) }

    inline fun <reified T : SessionStore> store(): T = stores.filterIsInstance<T>().single()

    fun bootstrap() {
        env.network.onChange = { from, to -> networkChanged(from, to) }
        env.network.start()
        val records = env.macStore.loadRecords()
        mutableState.update {
            it.copy(
                macs = records,
                activeMacId =
                    env.macStore.loadActiveId() ?: records.firstOrNull()?.localId
            )
        }
        upkeep.restoreSnapshot()
        env.unpair.retryPending()
        activeCredential()?.let(::connectBest)
    }

    /** The active Mac's stored credential (its link record's, for a machine visit). */
    fun activeCredential(): LpmClient.Credential? {
        val record = state.value.linkRecord ?: return null
        return env.credentials.load(record.localId)
    }

    /** Demo state and a visit's records are in memory only. */
    fun persistMacs() {
        val s = state.value
        if (s.demoMode || isVisit) return
        env.macStore.saveRecords(s.macs)
        env.macStore.saveActiveId(s.activeMacId)
    }

    internal fun updateMac(localId: String, change: (MacRecord) -> MacRecord) =
        mutableState.update { s ->
            s.copy(macs = s.macs.map { if (it.localId == localId) change(it) else it })
        }

    internal fun setConnection(next: LpmClient.State) {
        val old = state.value.connection
        if (old == next) return
        mutableState.update { it.copy(connection = next) }
        link.noteState(next, old)
    }

    /**
     * Probe the remembered addresses and connect to whichever the phone can reach
     * right now — the LAN IP at home, the Tailscale IP away from home.
     */
    fun connectBest(credential: LpmClient.Credential) {
        if (state.value.demoMode) return
        val hosts = savedHosts()
        val port = savedPort()
        setConnection(LpmClient.State.Connecting)
        val generation = ++probeGeneration
        probing = true
        scope.launch {
            val identity = probeIdentity(state.value.activeRecord)
            var race = env.prober.race(hosts, port, identity)
            link.noteProbe(race.outcomes)
            if (race.winner == null) {
                // On foreground the Tailscale tunnel may not be up yet: give it a
                // moment and probe once more before falling back.
                delay(SECOND_PROBE_DELAY_MS)
                race = env.prober.race(hosts, port, identity)
                link.noteProbe(race.outcomes)
            }
            // Nothing answered: prefer the Tailscale (CGNAT) address — the LAN IP is
            // unroutable on cellular, so retrying it spins.
            val host = race.winner ?: Hosts.cgnatHost(hosts) ?: hosts.firstOrNull() ?: "127.0.0.1"
            // A switch, pairing or newer attempt since this probe began owns the link.
            if (generation != probeGeneration) return@launch
            probing = false
            connect(host, port, credential)
        }
    }

    fun connect(host: String, port: Int, credential: LpmClient.Credential) {
        if (state.value.demoMode) return
        client?.disconnect()
        currentHost = host
        link.update { it.copy(host = host, pairing = false) }
        mutableState.update { it.copy(identityMismatch = false, needsRepair = false) }
        // The stored pin, read fresh on each handshake so a just-saved TOFU pin
        // applies to the next reconnect; no pin yet is accepted, then pinned.
        val pinId = state.value.linkRecord?.localId
        val c = env.clients.create(
            endpoint = LpmClient.Endpoint(host, port),
            credential = credential,
            deviceName = env.device.name,
            pinProvider = { pinId?.let(env.credentials::loadPin) },
            relay = state.value.activeRecord?.via?.slug
        )
        wire(c)
        client = c
        c.connect()
    }

    internal fun wire(c: LpmClient) {
        c.inForeground = inForeground
        wiring.wire(c)
        stores.forEach { it.wire(c) }
    }

    fun savedHosts(): List<String> = state.value.linkRecord?.hosts.orEmpty().ifEmpty {
        listOf("127.0.0.1")
    }

    fun savedPort(): Int = state.value.linkRecord?.port ?: DEFAULT_MAC_PORT

    /**
     * Send now when the Mac is connected; otherwise keep the action waiting in plain
     * sight until it is, for at most a couple of minutes.
     */
    fun whenConnected(verb: String, project: String, work: (LpmClient) -> Unit) {
        val c = client
        if (state.value.isReady && c != null) work(c) else link.enqueue(verb, project, work)
    }

    /**
     * Whether the open app shows this Mac's statuses live right now, so its push
     * needn't be shown too. A push from an older Mac carries no id and is taken to be
     * the live one's.
     */
    fun showsLive(serverId: String?): Boolean {
        val s = state.value
        if (!s.isReady) return false
        return serverId.isNullOrEmpty() || serverId == s.activeRecord?.serverId
    }

    /** The app came on screen or went away; the Mac notifies only while it's away. */
    fun setInForeground(active: Boolean) {
        if (!active) stores.forEach { it.flushPending() }
        inForeground = active
        client?.inForeground = active
        visitSession.value?.setInForeground(active)
    }

    /** Stop the recovery browse and its status — the app went to the background. */
    fun suspendRecoveryDiscovery() = recovery.suspendDiscovery()

    fun reconnectIfNeeded() {
        if (!isVisit) env.unpair.retryPending()
        visitSession.value?.reconnectIfNeeded()
        if (link.state.value.identityRejected) return
        // Even `Ready` can be stale after backgrounding (a half-open socket):
        // probe it instead of trusting it.
        if (state.value.isReady) return client?.verifyNow() ?: Unit
        // The phone may be on another network now, so check every saved address
        // rather than redialling the last one; the client keeps its subscriptions.
        upkeep.rehome(null)
        link.refreshReach()
    }

    /** "Try again": check every saved address now and dial the one that answers. */
    fun retryConnection() {
        if (link.state.value.identityRejected) return
        link.noteTrying()
        upkeep.rehome(null)
    }

    /**
     * Tear down the live connection and clear every cached per-session value, so
     * switching Macs (or removing one) starts clean. Saved records and their
     * credentials are untouched.
     */
    fun resetSessionState() {
        stores.forEach { it.flushPending() }
        visits.endVisit()
        client?.disconnect()
        client = null
        probeGeneration += 1
        probing = false
        link.resetSession()
        currentHost = null
        recovery.stopBrowsing()
        // Consumed by pair()/pairViaApproval() before they reset, so a re-pair that
        // never started can't re-point a later pairing at the wrong saved Mac.
        pairing.pendingRepairMacId = null
        mutableState.update {
            it.copy(
                recoveryStatus = null,
                approvalPairing = null,
                identityMismatch = false,
                needsRepair = false
            )
        }
        setConnection(LpmClient.State.Idle)
        wiring.wasReady = false
        alerts.dismissError()
        stores.forEach { it.reset() }
    }

    internal fun handleConnectionReset() = stores.forEach { it.onConnectionReset() }

    // MARK: Demo Mode

    /**
     * Enter the offline Demo Mode: a single in-memory "Demo Mac" backed by a fake
     * in-process server, wired through the normal client so every store runs
     * unchanged. Nothing is persisted, so a relaunch returns to pairing.
     */
    fun enterDemo() {
        resetSessionState()
        val record = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = DemoServer.SERVER_ID,
            name = DemoServer.SERVER_NAME,
            hosts = emptyList(),
            port = DEFAULT_MAC_PORT
        )
        mutableState.update {
            it.copy(demoMode = true, macs = listOf(record), activeMacId = record.localId)
        }
        val c = env.clients.demo(env.device.name)
        wire(c)
        client = c
        c.connect()
    }

    /**
     * Leave Demo Mode and restore whatever real pairing state is on disk (usually
     * none — the demo is offered on the fresh pairing screen).
     */
    fun exitDemo() {
        // Tear down while still in Demo Mode: the disconnect's bookkeeping persists
        // the active Mac, and only `demoMode` keeps the demo Mac off disk.
        resetSessionState()
        val records = env.macStore.loadRecords()
        mutableState.update {
            it.copy(
                demoMode = false,
                macs = records,
                activeMacId = env.macStore.loadActiveId() ?: records.firstOrNull()?.localId
            )
        }
        upkeep.restoreSnapshot()
        activeCredential()?.let(::connectBest)
    }

    // MARK: pairing

    fun pair(
        hosts: List<String>,
        port: Int,
        code: String,
        fingerprint: String? = null,
        replacing: String? = null
    ) = pairing.pair(hosts, port, code, fingerprint, replacing)

    fun pairViaApproval(host: String, port: Int, replacing: String? = null) =
        pairing.pairViaApproval(host, port, replacing)

    fun cancelApprovalPairing() = pairing.cancelApprovalPairing()

    fun beginAddMac() = pairing.beginAddMac()

    fun cancelAddMac() = pairing.cancelAddMac()

    fun repairActiveMac(reason: RepairReason? = null) = pairing.repairActiveMac(reason)

    fun repairRemovedMac() = pairing.repairRemovedMac()

    fun repairMac(target: String, reason: RepairReason) = pairing.repairMac(target, reason)

    // MARK: saved Macs

    fun switchTo(record: MacRecord) = savedMacs.switchTo(record)

    /** What a probe of `record`'s addresses expects: its link Mac's pin, or first use. */
    fun probeIdentity(record: MacRecord?): HostProber.Identity = savedMacs.probeIdentity(record)

    fun renameMac(id: String, newName: String) = savedMacs.renameMac(id, newName)

    fun updateEndpoint(id: String, hosts: List<String>, port: Int) =
        savedMacs.updateEndpoint(id, hosts, port)

    fun removeMac(id: String) = savedMacs.removeMac(id)

    fun trustNewIdentity() = savedMacs.trustNewIdentity()

    fun rejectNewIdentity() = savedMacs.rejectNewIdentity()

    /** A sweep connection learned a saved Mac's identity (push registration). */
    fun learnIdentity(localId: String, serverId: String?, serverName: String?, platform: String?) =
        savedMacs.learnIdentity(localId, serverId, serverName, platform)

    /** Save a machine the importer paired with in the background; never becomes active. */
    fun adoptMachine(machine: AdoptedMachine): String = savedMacs.adoptMachine(machine)

    /** The entry that opens one of the live Mac's machines through it (saved when `saving`). */
    fun recordThroughLiveMac(machine: RemoteMachine, saving: Boolean): MacRecord? =
        savedMacs.recordThroughLiveMac(machine, saving)

    // MARK: the link

    fun networkChanged(from: NetworkMonitor.Medium, to: NetworkMonitor.Medium) =
        upkeep.networkChanged(from, to)

    fun tailnetChanged(state: String) = upkeep.tailnetChanged(state)

    fun rehome(reason: ReconnectReason?) = upkeep.rehome(reason)

    /** Carry out a button an issue offers (OpenAdmin/PhoneSettings are the screen's). */
    fun perform(action: IssueAction, issue: ConnectionIssue) = upkeep.perform(action, issue)

    fun noteLeavingActiveMac() = upkeep.noteLeavingActiveMac(env.clock.instant())

    // MARK: visiting a machine

    fun beginVisit(
        machine: RemoteMachine,
        record: MacRecord?,
        project: String,
        terminal: String? = null
    ) = visits.beginVisit(machine, record, project, terminal)

    fun leaveVisit() = visits.leaveVisit()

    fun endVisit() = visits.endVisit()

    internal companion object {
        const val SECOND_PROBE_DELAY_MS = 2_000L
    }
}
