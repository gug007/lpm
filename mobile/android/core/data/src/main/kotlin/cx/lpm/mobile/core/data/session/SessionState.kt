package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.mac.MacRecord

/**
 * The connection and the saved Macs. `macs` empty means "not paired with any Mac"
 * and gates the root to the pairing screen; `activeMacId` names the one the live
 * session talks to.
 */
data class SessionState(
    val connection: LpmClient.State = LpmClient.State.Idle,
    val macs: List<MacRecord> = emptyList(),
    val activeMacId: String? = null,
    /** Drives the "Add a Mac" pairing sheet over the projects list. */
    val addingMac: Boolean = false,
    /**
     * A pairing link opened from outside the app (the Camera reading lpm's QR),
     * waiting for the pairing screen to ask before it pairs.
     */
    val pairLink: String? = null,
    /** The offline Demo Mode: an in-memory "Demo Mac", nothing persisted. */
    val demoMode: Boolean = false,
    /** "Found <name>, reconnecting…" while endpoint recovery reconnects; null when idle. */
    val recoveryStatus: String? = null,
    /** The approve-on-Mac pairing flow; null when not pairing this way. */
    val approvalPairing: ApprovalPairingState? = null,
    /** A reconnect's certificate no longer matches the pinned identity. */
    val identityMismatch: Boolean = false,
    /** The Mac rejected this device's credential: offer re-pairing, not a retry. */
    val needsRepair: Boolean = false
) {
    val isReady: Boolean get() = connection == LpmClient.State.Ready

    /** The Mac can't be reached right now, so what the phone kept is all there is. */
    val away: Boolean get() = !demoMode && !isReady

    /** The saved Mac the phone is (or should be) connected to. */
    val activeRecord: MacRecord? get() = activeMacId?.let { id ->
        macs.firstOrNull {
            it.localId ==
                id
        }
    }

    /**
     * The saved Mac a record's connection goes to: the record itself, or for a
     * machine opened through another Mac, that Mac — whose addresses, credential
     * and certificate it uses.
     */
    fun linkRecord(of: MacRecord): MacRecord {
        val via = of.via ?: return of
        return macs.firstOrNull { it.localId == via.macId } ?: of
    }

    val linkRecord: MacRecord? get() = activeRecord?.let(::linkRecord)

    /** The Mac `removeMac` of the active one switches to (null when it's the only one). */
    val nextMacAfterRemoval: MacRecord?
        get() = macs.firstOrNull { it.localId != activeMacId && it.via?.macId != activeMacId }

    /** The Mac a machine opened through another one goes through. */
    fun viaMac(of: MacRecord): MacRecord? {
        val via = of.via ?: return null
        return macs.firstOrNull { it.localId == via.macId }
    }
}

/**
 * An approve-on-Mac pairing attempt: `Requesting` until the Mac replies, `Waiting`
 * with the 4-digit code both screens show, then a terminal `Denied` / `TimedOut`.
 */
sealed interface ApprovalPairingState {
    data object Requesting : ApprovalPairingState

    data class Waiting(val matchCode: String) : ApprovalPairingState

    /** "busy" | "declined" | `LpmClient.BAD_ADDRESS_REASON`; `message` is a headless host's own. */
    data class Denied(val reason: String, val message: String?) : ApprovalPairingState

    data object TimedOut : ApprovalPairingState
}

/** Why the pairing screen was opened for a Mac that's already saved. */
enum class RepairReason { NotRecognized, Removed, Identity, Chosen }
