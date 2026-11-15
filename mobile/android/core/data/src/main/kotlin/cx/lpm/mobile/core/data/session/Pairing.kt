package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.link.Hosts
import cx.lpm.mobile.core.data.link.PairedSummary
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.model.DEFAULT_MAC_PORT
import cx.lpm.mobile.core.model.trimmedOrNull
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Pairing a Mac — by code, QR or approve-on-Mac — and adding or re-pairing one. */
internal class Pairing(private val s: MacSession) {
    // The candidate addresses/port of an in-flight pairing, stamped onto the saved
    // record once `paired` lands.
    private var pendingPairHosts = emptyList<String>()
    private var pendingPairPort = DEFAULT_MAC_PORT

    // Set while the pairing sheet was opened to re-pair a saved Mac: the record whose
    // stale credential the Mac should retire. Read at the top of pair() and
    // pairViaApproval() — both reset the session, which clears it.
    var pendingRepairMacId: String? = null

    /**
     * Begin pairing a Mac — the first, or another from "Add a Mac". The saved record
     * is created when `paired` lands ([handlePaired]), where re-pairing a saved Mac is
     * deduped by serverId. `replacing` names a saved Mac being re-paired.
     */
    fun pair(
        hosts: List<String>,
        port: Int,
        code: String,
        fingerprint: String?,
        replacing: String?
    ) {
        val target = replacing ?: pendingRepairMacId
        val replaces = staleDeviceId(target, hosts)
        s.resetSessionState()
        pendingRepairMacId = target
        pendingPairHosts = hosts
        pendingPairPort = port.coerceIn(0, MAX_PORT)
        s.link.update { it.copy(pairing = true, host = hosts.firstOrNull()) }
        s.setConnection(LpmClient.State.Connecting)
        s.scope.launch {
            // The probe uses the real transport, so if none respond the live
            // connection wouldn't either — fail fast and report each host's reason.
            val race = s.env.prober.race(hosts, port, HostProber.Identity(expected = fingerprint))
            s.link.noteProbe(race.outcomes)
            val host = race.winner
            if (host == null) {
                s.setConnection(LpmClient.State.Failed(LpmClient.OFFLINE_HINT))
                return@launch
            }
            s.client?.disconnect()
            s.currentHost = host
            s.link.update { it.copy(host = host) }
            // No stored pin during pairing; the QR's fingerprint (if any) is checked
            // instead, and the observed one is pinned once pairing succeeds.
            val c = s.env.clients.create(
                endpoint = LpmClient.Endpoint(host, port),
                credential = null,
                deviceName = s.env.device.name,
                expectedFingerprint = fingerprint
            )
            s.wire(c)
            s.client = c
            c.pair(host, port, code, replaces)
        }
    }

    /**
     * Approve-on-Mac pairing with a nearby Mac at a resolved address: send a pair
     * request and wait for the user to confirm on the Mac (no code typed).
     */
    fun pairViaApproval(host: String, port: Int, replacing: String?) {
        val target = replacing ?: pendingRepairMacId
        val replaces = staleDeviceId(target, listOf(host))
        s.resetSessionState()
        pendingRepairMacId = target
        pendingPairHosts = listOf(host)
        pendingPairPort = port.coerceIn(0, MAX_PORT)
        s.mutableState.update { it.copy(approvalPairing = ApprovalPairingState.Requesting) }
        s.currentHost = host
        s.link.update { it.copy(pairing = true, host = host) }
        // No QR fingerprint and no stored pin for a new Mac: trust on first use.
        val c = s.env.clients.create(
            endpoint = LpmClient.Endpoint(host, port),
            credential = null,
            deviceName = s.env.device.name
        )
        s.wire(c)
        s.client = c
        c.pairRequest(host, port, replaces)
    }

    /**
     * Cancel an approve-on-Mac pairing: tear down the never-authenticated client,
     * then reconnect the previously active Mac if there was one.
     */
    fun cancelApprovalPairing() {
        s.mutableState.update { it.copy(approvalPairing = null) }
        dropUnauthenticatedClient()
        if (s.client == null) s.activeCredential()?.let(s::connectBest)
    }

    /** Open "Add a Mac". In Demo Mode there's none to add beside it — leave the demo. */
    fun beginAddMac() {
        if (s.state.value.demoMode) return s.exitDemo()
        pendingRepairMacId = null
        s.link.update { it.copy(repairMacId = null, repairReason = null) }
        s.mutableState.update { it.copy(addingMac = true) }
    }

    /**
     * `lpm://pair?…`, the pairing QR read by the Camera instead of the app's scanner.
     * A link can come from anywhere, so it only opens the pairing screen with the
     * code waiting: the pairing screen asks before it pairs.
     */
    fun openPairingLink(url: String) {
        if (s.state.value.demoMode) s.exitDemo()
        s.mutableState.update { it.copy(pairLink = url) }
        presentPairLink()
    }

    /**
     * With a Mac saved, the code waits on "Add a machine" (or the re-pair already
     * open); with none, the pairing screen is the root and has it already.
     */
    fun presentPairLink() {
        val state = s.state.value
        if (state.pairLink == null || state.macs.isEmpty() || state.addingMac) return
        beginAddMac()
    }

    /** Hands the waiting code to the pairing screen that will ask about it. */
    fun takePairLink(): String? {
        val link = s.state.value.pairLink
        s.mutableState.update { it.copy(pairLink = null) }
        return link
    }

    /**
     * Dismiss "Add a Mac" and reconnect the Mac `pair()` tore down. A pairing still
     * in flight (or failed) leaves a client that never authenticated: tear it down
     * so it can't stamp hosts onto a new record later. One that did authenticate is
     * a pairing that just succeeded, and is left alone.
     */
    fun cancelAddMac() {
        s.mutableState.update { it.copy(addingMac = false) }
        pendingRepairMacId = null
        s.link.update { it.copy(repairMacId = null, repairReason = null) }
        dropUnauthenticatedClient()
        if (pendingSummary != null) {
            val summary = pendingSummary
            pendingSummary = null
            s.link.update { it.copy(summary = summary) }
        }
        if (s.client == null) {
            val credential = s.activeCredential() ?: return
            s.upkeep.restoreSnapshot()
            s.connectBest(credential)
        }
    }

    // The summary held back while the "Add a Mac" sheet was up.
    private var pendingSummary: PairedSummary? = null

    private fun dropUnauthenticatedClient() {
        val c = s.client ?: return
        if (c.deviceId != null) return
        c.disconnect()
        s.client = null
        s.currentHost = null
        pendingPairHosts = emptyList()
        s.link.update { it.copy(pairing = false, host = null) }
    }

    /**
     * Pair the active Mac again after it stopped recognizing this phone: the new
     * credential replaces the dead one on the Mac, and the serverId dedupe refreshes
     * the saved record in place.
     */
    fun repairActiveMac(reason: RepairReason?) {
        // A machine opened through another Mac is paired again by pairing that Mac.
        val state = s.state.value
        val target = state.linkRecord?.localId
        if (state.demoMode || target == null) return
        val why =
            reason ?: if (state.needsRepair) RepairReason.NotRecognized else RepairReason.Chosen
        // Only the live session can put up the pairing sheet.
        (s.visits.host ?: s).repairMac(target, why)
    }

    /**
     * Pair the active machine itself after it removed this phone: the Mac it was
     * opened through can't bring it back, only pairing on the machine can.
     */
    fun repairRemovedMac() {
        val state = s.state.value
        val target = state.activeRecord?.localId
        if (state.demoMode || target == null) return
        (s.visits.host ?: s).repairMac(target, RepairReason.Removed)
    }

    fun repairMac(target: String, reason: RepairReason) {
        pendingRepairMacId = target
        s.link.update {
            it.copy(
                repairMacId = target,
                repairReason = reason,
                sheetOpen = false,
                identityCheckOpen = false
            )
        }
        s.mutableState.update { it.copy(addingMac = true) }
    }

    // The Mac being paired plausibly is the saved one when it answers at an address
    // that record knows. A sheet opened by "Pair again" can end up scanning another
    // Mac's QR, which must never be handed this phone's id for another one.
    private fun isRepairTarget(macId: String?, hosts: List<String>): Boolean {
        val record = s.state.value.macs.firstOrNull { it.localId == macId } ?: return false
        val known = record.hosts.map(String::lowercase).toSet()
        return hosts.any { it.lowercase() in known }
    }

    private fun staleDeviceId(macId: String?, hosts: List<String>): String? {
        if (macId == null || !isRepairTarget(macId, hosts)) return null
        return s.env.credentials.load(macId)?.deviceId
    }

    /**
     * A fresh pairing landed: save the credential and create the record — or, when
     * the Mac's serverId matches a saved one (a re-pair), refresh it in place. Either
     * way the paired Mac becomes active.
     */
    fun handlePaired(
        deviceId: String,
        token: String,
        serverId: String?,
        serverName: String?,
        advertisedHosts: List<String>,
        platform: String?
    ) {
        // QR/pending hosts lead (the probe proved one reachable); the Mac's own list
        // fills in what the QR didn't carry.
        val hosts = pendingPairHosts.ifEmpty { s.savedHosts() }.toMutableList()
        for (h in advertisedHosts) if (h.isNotEmpty() && h !in hosts) hosts += h
        val port = pendingPairPort
        pendingPairHosts = emptyList()

        val macs = s.state.value.macs
        val existing = serverId?.ifEmpty { null }?.let { sid ->
            macs.firstOrNull {
                it.serverId ==
                    sid
            }
        }
        val localId = if (existing != null) {
            // Any pairing of a saved Mac often resolves only the one address it
            // reached it at, so fold the new ones in rather than drop the Tailscale
            // and hand-entered addresses this phone needs away from home.
            s.updateMac(existing.localId) { r ->
                r.copy(
                    via = null,
                    hosts = Hosts.union(r.hosts, hosts),
                    port = port,
                    name = serverName?.ifEmpty { null } ?: r.name,
                    platform = platform.trimmedOrNull() ?: r.platform
                )
            }
            existing.localId
        } else {
            val record = MacRecord(
                localId = MacRecord.newLocalId(),
                serverId = serverId,
                name = serverName.trimmedOrNull() ?: hosts.firstOrNull() ?: "My Mac",
                hosts = hosts,
                port = port,
                platform = platform.trimmedOrNull()
            )
            s.mutableState.update { it.copy(macs = it.macs + record) }
            record.localId
        }
        val credentials = s.env.credentials
        credentials.save(deviceId, token, localId)
        // The Mac minted a new device record holding no push identity yet.
        s.env.prefs.remove(PreferenceKeys.pushRegistered(localId))
        // Pairing (re)establishes trust: pin the certificate the handshake accepted
        // (it matched the QR's when one was given), replacing any older pin.
        s.client?.observedFingerprint?.ifEmpty { null }?.let { credentials.savePin(it, localId) }
        val now = s.env.clock.instant()
        s.updateMac(localId) { it.copy(farewell = null, lastConnected = now) }
        s.mutableState.update { it.copy(approvalPairing = null, activeMacId = localId) }
        s.persistMacs()
        s.link.update { it.copy(pairing = false, repairMacId = null, repairReason = null) }
        // Shown once the pairing screen has gone, so the two never compete.
        val summary = PairedSummary(localId)
        if (s.state.value.addingMac) {
            pendingSummary = summary
        } else {
            s.scope.launch {
                delay(SUMMARY_DELAY_MS)
                s.link.update { it.copy(summary = summary) }
            }
        }
        s.mutableState.update { it.copy(addingMac = false) }
    }

    private companion object {
        const val MAX_PORT = 65_535
        const val SUMMARY_DELAY_MS = 600L
    }
}
