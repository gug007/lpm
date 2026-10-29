package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.client.requestDuplicateDefaults
import cx.lpm.mobile.core.data.client.requestJobs
import cx.lpm.mobile.core.data.client.requestMachines
import cx.lpm.mobile.core.data.client.requestProjects
import cx.lpm.mobile.core.data.client.requestSidebar
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** The session's own client callbacks (iOS `wireConnection`). */
internal class ConnectionWiring(private val s: MacSession) {
    // Whether the link was live, so a move away from `Ready` is seen as a socket
    // teardown (a background→foreground drop goes Connecting → Ready without Failed).
    var wasReady = false

    fun wire(c: LpmClient) {
        c.onState = { state -> stateChanged(c, state) }
        c.onPaired = { deviceId, token, serverId, serverName, hosts, platform ->
            s.pairing.handlePaired(deviceId, token, serverId, serverName, hosts, platform)
        }
        c.onPairPending = { matchCode ->
            s.mutableState.update {
                it.copy(approvalPairing = ApprovalPairingState.Waiting(matchCode))
            }
        }
        c.onPairDenied = { reason, message ->
            val outcome = when (reason) {
                "busy" -> ApprovalPairingState.Denied("busy", null)

                LpmClient.BAD_ADDRESS_REASON -> ApprovalPairingState.Denied(
                    LpmClient.BAD_ADDRESS_REASON,
                    null
                )

                "timeout" -> ApprovalPairingState.TimedOut

                else -> ApprovalPairingState.Denied("declined", message)
            }
            s.mutableState.update { it.copy(approvalPairing = outcome) }
        }
        c.onIdentity = { serverId, serverName, platform ->
            s.state.value.activeMacId?.let {
                s.savedMacs.learnIdentity(it, serverId, serverName, platform)
            }
        }
        c.onAdvertisedHosts =
            { serverId, hosts -> s.savedMacs.mergeAdvertisedHosts(serverId, hosts) }
        c.onWakeTargets = { serverId, targets -> s.wake.rememberTargets(serverId, targets) }
        c.onFarewell = { reason, at -> if (c === s.client) s.upkeep.noteFarewell(reason, at) }
        c.onFarewellWithdrawn = { if (c === s.client) s.upkeep.withdrawFarewell() }
        c.onListFrame = { text ->
            val id = s.state.value.activeMacId
            if (c === s.client && c.deviceId != null && !s.state.value.demoMode && !s.isVisit &&
                id != null
            ) {
                s.env.snapshots.record(text, id)
            }
        }
    }

    private fun stateChanged(c: LpmClient, state: LpmClient.State) {
        // A pinned-identity mismatch on reconnect (a QR pairing abort is the pairing
        // screen's): keep the certificate the Mac presented, so the user can compare
        // its code before trusting it. Any other state clears the flag.
        val mismatch = state == LpmClient.State.Failed(LpmClient.IDENTITY_CHANGED_ERROR)
        if (mismatch && !s.state.value.identityMismatch) {
            s.link.update {
                it.copy(newFingerprint = c.observedFingerprint, identityCheckOpen = true)
            }
        }
        // Same shape: the Mac no longer holds a record for this device.
        val needsRepair = state == LpmClient.State.Failed(LpmClient.UNAUTHORIZED_ERROR) ||
            state == LpmClient.State.Failed(LpmClient.REVOKED_ERROR)
        s.mutableState.update { it.copy(identityMismatch = mismatch, needsRepair = needsRepair) }
        if (state == LpmClient.State.Failed(LpmClient.REVOKED_ERROR) && c === s.client) {
            s.scope.launch { if (c === s.client) s.savedMacs.dropMacThatRemovedThisPhone() }
        }
        s.setConnection(state)
        s.upkeep.repickHostIfStale(state, c)
        s.recovery.startIfStale(state, c)
        val nowReady = state == LpmClient.State.Ready
        // The live socket dropped: any request awaiting a reply is now dead.
        if (wasReady && !nowReady) {
            s.handleConnectionReset()
            s.upkeep.noteLeavingActiveMac(c.lastHeard ?: s.env.clock.instant())
        }
        wasReady = nowReady
        if (!nowReady) return
        s.upkeep.noteConnected(c)
        // The link is back — a recovery browse (if any) has done its job.
        s.recovery.stopBrowsing()
        s.mutableState.update { it.copy(recoveryStatus = null) }
        // Trust on first use: pin this connection's certificate if the Mac has none.
        s.savedMacs.persistObservedPinIfNeeded()
        c.requestProjects()
        c.requestSidebar()
        c.requestDuplicateDefaults()
        c.requestJobs()
        // Demo Mode has no push identity and no machines; a visit adds nothing here.
        if (!s.state.value.demoMode && !s.isVisit) c.requestMachines()
        s.stores.forEach { it.onReady(c) }
    }
}
