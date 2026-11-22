package cx.lpm.mobile.core.data.link

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.mac.Farewell as MacFarewell

/** What changed on the phone's side to set off the current reconnect. */
enum class ReconnectReason { LeftWiFi, JoinedWiFi, BackOnline }

/** Where Built-in Tailscale stands when it's what the phone needs to reach a Mac away. */
enum class AwaySetup { TurnOn, SignIn, WaitingApproval, Broken, MacSetup, App }

/**
 * The one thing standing between the phone and the active Mac, named by cause. Each
 * cause has its own title, one sentence and the button that fixes it ([issueCopy]);
 * addresses and error codes stay behind Details.
 */
sealed interface ConnectionIssue {
    data class Connecting(val reason: ReconnectReason?) : ConnectionIssue

    data object PhoneOffline : ConnectionIssue

    data class NotAnswering(val away: Boolean) : ConnectionIssue

    data class AwayNeedsTailscale(val setup: AwaySetup) : ConnectionIssue

    data object LpmNotRunning : ConnectionIssue

    data object SecureFailed : ConnectionIssue

    data object NotRecognized : ConnectionIssue

    /**
     * The machine removed this phone. A Mac it was opened through, or a code another
     * Mac armed, can't bring it back; only pairing on it can.
     */
    data object RemovedOnMac : ConnectionIssue

    data object IdentityChanged : ConnectionIssue

    data object IdentityRejected : ConnectionIssue

    data class Farewell(val farewell: MacFarewell) : ConnectionIssue

    data class PairUnreachable(val overTailscale: Boolean) : ConnectionIssue

    data object CodeRejected : ConnectionIssue

    data object PairingUnavailable : ConnectionIssue

    data object QrMismatch : ConnectionIssue

    /** A machine opened through another Mac (`via`) that it can't reach right now. */
    data class RelayOffline(val via: String) : ConnectionIssue

    /** …or whose lpm is too old to be opened that way. */
    data class RelayUnsupported(val via: String) : ConnectionIssue

    val isConnecting: Boolean get() = this is Connecting

    /**
     * A tap on this phone can fix it, so it earns a bar of its own. The rest only
     * need waiting, and the line under the Mac's name says so. Opening lpm from
     * here is a fix this phone may have too.
     */
    fun needsYou(canOpenLpm: Boolean = false): Boolean =
        issueCopy("your Mac", "phone", canOpenLpm = canOpenLpm).actions.any {
            it != IssueAction.Retry &&
                it != IssueAction.Details
        }

    companion object {
        fun derive(f: LinkFacts): ConnectionIssue? {
            val state = f.state
            if (state == LpmClient.State.Ready) return null
            if (f.identityRejected) return IdentityRejected
            if (f.identityMismatch) return IdentityChanged
            if (state == LpmClient.State.Failed(LpmClient.REVOKED_ERROR)) return RemovedOnMac
            if (f.needsRepair || f.credentialMissing) return NotRecognized
            if (!f.online) return PhoneOffline
            if (state is LpmClient.State.Failed) {
                return when (state.message) {
                    LpmClient.SECURE_FAILED_ERROR -> SecureFailed

                    LpmClient.REFUSED_ERROR -> when {
                        f.pairing -> PairUnreachable(f.pairingOverTailscale)
                        f.farewell != null -> Farewell(f.farewell)
                        else -> LpmNotRunning
                    }

                    LpmClient.PAIRING_REJECTED_ERROR -> CodeRejected

                    LpmClient.PAIRING_UNAVAILABLE_ERROR -> PairingUnavailable

                    LpmClient.PAIR_MISMATCH_ERROR -> QrMismatch

                    LpmClient.IDENTITY_CHANGED_ERROR -> IdentityChanged

                    LpmClient.UNAUTHORIZED_ERROR, LpmClient.NO_CREDENTIAL_ERROR -> NotRecognized

                    LpmClient.RELAY_OFFLINE_ERROR -> RelayOffline(f.via ?: "your Mac")

                    LpmClient.RELAY_UNSUPPORTED_ERROR -> RelayUnsupported(f.via ?: "your Mac")

                    else -> unreachable(f)
                }
            }
            if (f.farewell != null && !f.pairing) return awayProblem(f) ?: Farewell(f.farewell)
            if (f.probedAllFailed) return unreachable(f)
            return Connecting(f.reconnectReason)
        }

        private fun isAway(f: LinkFacts): Boolean = f.onCellular || !f.atHome

        // What keeps a phone away from the Mac's network from reaching it at all —
        // which outranks anything the Mac said, since it can't connect either way.
        private fun awayProblem(f: LinkFacts): ConnectionIssue? {
            if (!isAway(f)) return null
            if (!f.hasAwayAddress) return AwayNeedsTailscale(AwaySetup.MacSetup)
            if (!f.tailscaleEnabled) {
                return if (f.usesTailscaleApp) null else AwayNeedsTailscale(AwaySetup.TurnOn)
            }
            return when (f.tailscaleState) {
                "needsLogin" -> AwayNeedsTailscale(AwaySetup.SignIn)
                "needsApproval" -> AwayNeedsTailscale(AwaySetup.WaitingApproval)
                "error", "stopped" -> AwayNeedsTailscale(AwaySetup.Broken)
                else -> null
            }
        }

        private fun unreachable(f: LinkFacts): ConnectionIssue {
            if (f.pairing) return PairUnreachable(f.pairingOverTailscale)
            awayProblem(f)?.let { return it }
            f.farewell?.let { return Farewell(it) }
            if (!isAway(f)) return NotAnswering(away = false)
            if (f.tailscaleEnabled) {
                return if (f.tailscaleState == "running") {
                    NotAnswering(away = true)
                } else {
                    Connecting(f.reconnectReason)
                }
            }
            return AwayNeedsTailscale(AwaySetup.App)
        }
    }
}

/** Everything the issue depends on, gathered by the link store so the rules stay pure. */
data class LinkFacts(
    val state: LpmClient.State,
    val pairing: Boolean = false,
    val pairingOverTailscale: Boolean = false,
    val needsRepair: Boolean = false,
    /** A saved Mac with no credential to sign in with, so nothing ever dials. */
    val credentialMissing: Boolean = false,
    val identityMismatch: Boolean = false,
    val identityRejected: Boolean = false,
    val online: Boolean = true,
    val onCellular: Boolean = false,
    val atHome: Boolean = false,
    val hasAwayAddress: Boolean = false,
    /** The user said they reach their Macs with the Tailscale app. */
    val usesTailscaleApp: Boolean = false,
    val tailscaleEnabled: Boolean = false,
    val tailscaleState: String = "off",
    val probedAllFailed: Boolean = false,
    val farewell: MacFarewell? = null,
    val reconnectReason: ReconnectReason? = null,
    /** The Mac the active machine is opened through, when it isn't on this phone. */
    val via: String? = null
)
