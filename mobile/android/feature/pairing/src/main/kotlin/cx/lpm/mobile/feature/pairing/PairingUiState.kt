package cx.lpm.mobile.feature.pairing

import cx.lpm.mobile.core.data.link.AddressCheck
import cx.lpm.mobile.core.data.link.AddressKind
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.MacBrowser
import cx.lpm.mobile.core.data.mac.MacRecord
import cx.lpm.mobile.core.data.session.ApprovalPairingState
import cx.lpm.mobile.core.data.session.RepairReason
import cx.lpm.mobile.core.model.DEFAULT_MAC_PORT
import cx.lpm.mobile.core.tailnet.TailnetStatus
import java.util.UUID

/** Where the "use lpm anywhere" card stands. */
enum class AwayPhase { Ready, App, InProgress, NotSetUp, LocalOnly }

/** Enter a Code, opened with the address of a nearby Mac or empty. */
data class CodeTarget(
    val host: String = "",
    val port: Int = DEFAULT_MAC_PORT,
    val id: String = UUID.randomUUID().toString()
)

data class PairingUiState(
    /** Shown as "Add a machine" over the projects list, with Cancel, not as the first screen. */
    val adding: Boolean = false,
    /** A saved Mac being paired again. */
    val repair: MacRecord? = null,
    val repairReason: RepairReason? = null,
    val tailscale: TailnetStatus = TailnetStatus(),
    val tailscaleEnabled: Boolean = false,
    val usesTailscaleApp: Boolean = false,
    val localOnly: Boolean = false,
    val browse: MacBrowser.Browse = MacBrowser.Browse(),
    /** Macs already on this phone, shown as added. */
    val pairedServerIds: Set<String> = emptySet(),
    val resolvingId: String? = null,
    val issue: ConnectionIssue? = null,
    val checks: Map<String, AddressCheck> = emptyMap(),
    val showDetails: Boolean = false,
    val scanning: Boolean = false,
    val approval: ApprovalPairingState? = null,
    val approvalMacName: String = "",
    /** A scanned code whose Mac has no away-from-home address, held until the user says so. */
    val heldScan: PairPayload? = null,
    /** A code the Camera opened the app with, held until the user says to pair. */
    val linkToConfirm: PairPayload? = null,
    /** A nearby Mac whose address didn't answer. */
    val unreachable: MacBrowser.DiscoveredMac? = null,
    /** Enter a Code to open, with the address of the Mac picked. */
    val codeTarget: CodeTarget? = null
) {
    /** Pairing here will work away from home. */
    val worksAnywhere: Boolean
        get() = if (tailscaleEnabled) tailscale.state == "running" else usesTailscaleApp

    /**
     * Without Tailscale a pairing works only on the Mac's Wi-Fi, so the ways to pair
     * wait for a choice.
     */
    val showsWaysToPair: Boolean get() = repair != null || localOnly || worksAnywhere

    /**
     * A code whose Mac has no away-from-home address, before the user has said
     * pairing for this Wi-Fi only is fine.
     */
    fun wifiOnly(payload: PairPayload): Boolean =
        repair == null && !localOnly && payload.hosts.none { AddressKind.of(it).worksAway }

    val awayPhase: AwayPhase
        get() = when {
            tailscaleEnabled && tailscale.state == "running" -> AwayPhase.Ready
            !tailscaleEnabled && usesTailscaleApp -> AwayPhase.App
            localOnly -> AwayPhase.LocalOnly
            tailscaleEnabled -> AwayPhase.InProgress
            else -> AwayPhase.NotSetUp
        }

    /** The nearby Macs, the one being paired again first. */
    val nearby: List<MacBrowser.DiscoveredMac>
        get() {
            val preferred = repair?.serverId ?: return browse.found
            return browse.found.filter { it.serverId == preferred } +
                browse.found.filter { it.serverId != preferred }
        }
}
