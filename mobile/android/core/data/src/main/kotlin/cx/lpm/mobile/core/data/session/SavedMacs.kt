package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.link.HostProber
import cx.lpm.mobile.core.data.link.Hosts
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.mac.MacVia
import cx.lpm.mobile.core.data.prefs.PreferenceKeys
import cx.lpm.mobile.core.model.RemoteMachine
import cx.lpm.mobile.core.model.trimmedOrNull
import cx.lpm.mobile.core.model.trimmingWhitespace
import kotlinx.coroutines.flow.update

/** The saved Macs: switching, renaming, addresses, removal, identity and pins. */
internal class SavedMacs(private val s: MacSession) {
    private val credentials get() = s.env.credentials

    /** Switch the live connection to another saved Mac, starting the session clean. */
    fun switchTo(record: MacRecord) {
        if (record.localId == s.state.value.activeMacId) return
        if (s.state.value.isReady) s.upkeep.noteLeavingActiveMac(s.env.clock.instant())
        s.resetSessionState()
        s.mutableState.update { it.copy(activeMacId = record.localId) }
        s.env.macStore.saveActiveId(record.localId)
        s.upkeep.restoreSnapshot()
        s.link.forgetReach(record.localId)
        s.link.refreshReach(force = true)
        credentials.load(s.state.value.linkRecord(record).localId)?.let(s::connectBest)
    }

    /**
     * The certificate a probe of `record`'s addresses expects: the pin of the Mac it
     * connects through, or trust on first use before there is one.
     */
    fun probeIdentity(record: MacRecord?): HostProber.Identity {
        val target = record?.let(s.state.value::linkRecord) ?: return HostProber.Identity.FirstUse
        return HostProber.Identity(pin = credentials.loadPin(target.localId))
    }

    /**
     * Give a Mac a user-chosen name. A blank name — or the learned one unchanged —
     * clears it, so future serverName updates aren't pinned over.
     */
    fun renameMac(id: String, newName: String) {
        val record = s.state.value.macs.firstOrNull { it.localId == id } ?: return
        val trimmed = newName.trimmingWhitespace()
        val custom = if (trimmed.isEmpty() || trimmed == record.name) null else trimmed
        s.updateMac(id) { it.copy(customName = custom) }
        s.persistMacs()
    }

    /**
     * Replace a Mac's addresses and port (the manual endpoint editor). The
     * credential is untouched; the active Mac re-probes and reconnects.
     */
    fun updateEndpoint(id: String, hosts: List<String>, port: Int) {
        val record = s.state.value.macs.firstOrNull { it.localId == id } ?: return
        val cleaned = hosts.map { it.trimmingWhitespace() }.filter { it.isNotEmpty() }
        if (cleaned.isEmpty()) return
        val changed = record.hosts != cleaned || record.port != port
        s.updateMac(id) { it.copy(hosts = cleaned, port = port) }
        s.persistMacs()
        if (id == s.state.value.activeMacId) {
            if (changed) s.activeCredential()?.let(s::connectBest)
        } else {
            s.link.forgetReach(id)
            s.link.refreshReach(force = true)
        }
    }

    /**
     * The active Mac removed this phone on its side, so it goes from here too.
     * Nothing is sent back: the Mac already let go. Through another Mac, it was the
     * machine opened that way that did, and only it goes.
     */
    fun dropMacThatRemovedThisPhone() {
        val record = s.state.value.activeRecord ?: return
        val owner = s.visits.host ?: s
        owner.savedMacs.removeMac(record.localId, tellMac = false)
        owner.alerts.showNotice(
            "“${record.displayName}” removed this ${s.env.device.noun}. " +
                "Pair it there to use it here again."
        )
    }

    /**
     * Remove a saved Mac with its credential and saved list. Removing the active one
     * switches to another saved Mac if one remains — otherwise back to pairing.
     */
    fun removeMac(id: String, tellMac: Boolean = true) {
        if (s.state.value.demoMode) return s.exitDemo()
        val macs = s.state.value.macs
        // The Mac forgets this phone too. A machine opened through another Mac
        // connects with that Mac's credential, so removing it sends nothing.
        val record = macs.firstOrNull { it.localId == id }
        val credential = credentials.load(id)
        if (tellMac && record != null && record.via == null && credential != null) {
            s.env.unpair.send(record.hosts, record.port, credential, credentials.loadPin(id))
        }
        s.endVisit()
        // The machines opened through this Mac go with it: they connect as it.
        val gone = setOf(id) + macs.filter { it.via?.macId == id }.map { it.localId }
        val wasActive = s.state.value.activeMacId in gone
        val next = if (wasActive) macs.firstOrNull { it.localId !in gone } else null
        if (wasActive) s.resetSessionState()
        for (removed in gone) {
            credentials.delete(removed)
            s.env.prefs.remove(PreferenceKeys.pushRegistered(removed))
            s.env.snapshots.remove(removed)
            s.env.agentTabs.remove(removed)
            s.link.forgetReach(removed)
        }
        s.mutableState.update { st ->
            st.copy(
                macs = st.macs.filterNot { it.localId in gone },
                activeMacId = if (wasActive) next?.localId else st.activeMacId
            )
        }
        s.persistMacs()
        if (wasActive && next != null) {
            val nextCredential = credentials.load(s.state.value.linkRecord(next).localId) ?: return
            s.upkeep.restoreSnapshot()
            s.connectBest(nextCredential)
        }
    }

    /**
     * Save a machine paired in the background. Unlike a pairing it never becomes
     * active, and the Mac's own name for it wins, so it reads here as it does there.
     */
    fun adoptMachine(p: AdoptedMachine): String {
        val existing = p.serverId?.let { sid ->
            s.state.value.macs.firstOrNull { it.serverId == sid }
        }
        val localId = if (existing != null) {
            s.updateMac(existing.localId) {
                it.copy(via = null, hosts = Hosts.union(it.hosts, p.hosts), port = p.port)
            }
            existing.localId
        } else {
            val name = p.serverName.trimmedOrNull() ?: p.label
            val label = p.label.trimmedOrNull()
            val record = MacRecord(
                localId = MacRecord.newLocalId(),
                serverId = p.serverId,
                name = name,
                customName = label?.takeIf { it != name },
                hosts = p.hosts,
                port = p.port,
                platform = p.platform
            )
            s.mutableState.update { it.copy(macs = it.macs + record) }
            record.localId
        }
        credentials.save(p.deviceId, p.token, localId)
        p.fingerprint?.let { credentials.savePin(it, localId) }
        s.env.prefs.remove(PreferenceKeys.pushRegistered(localId))
        s.persistMacs()
        return localId
    }

    /** A connection reached `ready` carrying identity: learn/refresh the record's. */
    fun learnIdentity(localId: String, serverId: String?, serverName: String?, platform: String?) {
        val record = s.state.value.macs.firstOrNull { it.localId == localId } ?: return
        var next = record
        if (!serverId.isNullOrEmpty() &&
            next.serverId != serverId
        ) {
            next = next.copy(serverId = serverId)
        }
        serverName.trimmedOrNull()?.let { if (next.name != it) next = next.copy(name = it) }
        platform.trimmedOrNull()?.let { if (next.platform != it) next = next.copy(platform = it) }
        if (next == record) return
        s.updateMac(localId) { next }
        s.persistMacs()
    }

    /**
     * A `ready` advertised the Mac's candidate addresses: fold them into the record
     * matching the FRAME's serverId — never the active record, which a pairing
     * connection hasn't been assigned to yet when its `ready` lands.
     */
    fun mergeAdvertisedHosts(serverId: String?, hosts: List<String>) {
        if (s.state.value.demoMode || serverId.isNullOrEmpty() || hosts.isEmpty()) return
        val record =
            s.state.value.macs.firstOrNull { it.serverId == serverId && it.via == null } ?: return
        val merged = Hosts.union(record.hosts, hosts)
        if (merged == record.hosts) return
        s.updateMac(record.localId) { it.copy(hosts = merged) }
        s.persistMacs()
    }

    /**
     * Trust on first use: pin the observed certificate if this Mac has no pin yet.
     * Never overwrites one — a changed certificate is caught by the pin check.
     */
    fun persistObservedPinIfNeeded() {
        val id = s.state.value.linkRecord?.localId ?: return
        val fingerprint = s.client?.observedFingerprint?.ifEmpty { null } ?: return
        if (credentials.loadPin(id) == null) credentials.savePin(fingerprint, id)
    }

    /**
     * "Trust New Identity": pin exactly the certificate whose code the user compared
     * (so a further change is caught again), then reconnect.
     */
    fun trustNewIdentity() {
        val id = s.state.value.linkRecord?.localId ?: return
        val fingerprint = s.link.state.value.newFingerprint
        if (fingerprint != null) credentials.savePin(fingerprint, id) else credentials.deletePin(id)
        s.mutableState.update { it.copy(identityMismatch = false) }
        s.link.update { it.copy(identityCheckOpen = false, newFingerprint = null) }
        s.link.clearFailure()
        s.activeCredential()?.let(s::connectBest)
    }

    /** The codes didn't match: stop connecting, and leave re-pairing as the way back. */
    fun rejectNewIdentity() {
        s.client?.disconnect()
        s.mutableState.update { it.copy(identityMismatch = false) }
        s.link.update { it.copy(identityRejected = true, identityCheckOpen = false) }
    }

    /**
     * The entry that opens one of the live Mac's machines through it — only a Mac
     * this phone reaches itself can carry it on. Saved the first time when `saving`.
     */
    fun recordThroughLiveMac(machine: RemoteMachine, saving: Boolean): MacRecord? {
        val mac = s.state.value.activeRecord ?: return null
        if (mac.via != null || !machine.relay) return null
        val via = MacVia(mac.localId, machine.slug)
        s.state.value.macs.firstOrNull { it.via == via }?.let { return it }
        val record = MacRecord(
            localId = MacRecord.newLocalId(),
            serverId = machine.serverId,
            name = machine.name,
            customName = machine.name,
            hosts = emptyList(),
            port = mac.port,
            platform = machine.platform,
            via = via
        )
        if (saving) {
            s.mutableState.update { it.copy(macs = it.macs + record) }
            s.persistMacs()
        }
        return record
    }
}

/** A machine the importer paired with in the background, to save beside the live Mac. */
data class AdoptedMachine(
    val serverId: String?,
    val serverName: String?,
    val label: String,
    val hosts: List<String>,
    val port: Int,
    val platform: String?,
    val deviceId: String,
    val token: String,
    val fingerprint: String?
)
