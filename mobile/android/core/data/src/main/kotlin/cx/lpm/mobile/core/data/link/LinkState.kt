package cx.lpm.mobile.core.data.link

import cx.lpm.mobile.core.data.session.RepairReason
import java.time.Instant
import java.util.UUID

/** One address's result from the last reachability check. */
data class AddressCheck(val reachable: Boolean, val detail: String, val at: Instant)

/** Whether a saved machine other than the active one answers right now. */
enum class MacReach { Checking, Online, Offline }

/**
 * A Start, Stop or Run tapped while the Mac wasn't connected. It waits where the
 * user can see it for at most [LIFETIME_MS], then stops.
 */
data class QueuedAction(
    val project: String,
    val verb: String,
    val queuedAt: Instant,
    val expired: Boolean = false,
    val id: String = UUID.randomUUID().toString()
) {
    companion object {
        const val LIFETIME_MS = 120_000L
    }
}

/** The "you're connected" check shown once a pairing lands. */
data class PairedSummary(val macId: String, val id: String = UUID.randomUUID().toString())

/**
 * Everything about the link to the active Mac that the connection screens show,
 * besides what [LinkStore] derives from it and the session.
 */
data class LinkState(
    /** The address the live connection (or the current attempt) dials. */
    val host: String? = null,
    /** The current client is pairing rather than reconnecting a saved Mac. */
    val pairing: Boolean = false,
    val checks: Map<String, AddressCheck> = emptyMap(),
    val testing: Set<String> = emptySet(),
    val probedAllFailed: Boolean = false,
    val connectedSince: Instant? = null,
    /** Still connecting after a couple of seconds — worth saying so. */
    val slowConnect: Boolean = false,
    /** The last failure since the link was up; retries show it rather than flicker. */
    val lastFailure: String? = null,
    /** "Try again" was just tapped and its check of the addresses is running. */
    val trying: Boolean = false,
    val reconnectReason: ReconnectReason? = null,
    /** When the project list on screen was last live; null while it is. */
    val listAsOf: Instant? = null,
    val queued: List<QueuedAction> = emptyList(),
    val identityRejected: Boolean = false,
    /** The certificate fingerprint the Mac presented when its identity changed. */
    val newFingerprint: String? = null,
    val identityCheckOpen: Boolean = false,
    val sheetOpen: Boolean = false,
    val tailscaleSettingsOpen: Boolean = false,
    val manageOpen: Boolean = false,
    val reach: Map<String, MacReach> = emptyMap(),
    val tailscaleWorking: Boolean = false,
    val tailscaleFailure: String? = null,
    /** A Built-in Tailscale sign-in page to open over the screen that asked. */
    val tailscalePage: String? = null,
    val summary: PairedSummary? = null,
    val repairMacId: String? = null,
    val repairReason: RepairReason? = null,
    /** When this phone last sent the active Mac a wake signal (millis). */
    val wakeSentAt: Long? = null
) {
    val waitingCount: Int get() = queued.count { !it.expired }

    fun queued(project: String): List<QueuedAction> = queued.filter { it.project == project }

    val identityCode: String? get() = newFingerprint?.let(IdentityCode::of)
}

/** What the connection UI reads, derived from the link, the session and the network. */
data class LinkView(
    val issue: ConnectionIssue?,
    /** None while a reconnect is still quick. */
    val visibleIssue: ConnectionIssue?,
    /** Only one a tap on this phone fixes earns a bar over the list. */
    val barIssue: ConnectionIssue?,
    /** A reconnect in its first seconds, which changes only the line under the name. */
    val quietReconnect: Boolean,
    val statusLine: LinkStatusLine,
    /** "MacBook Pro", or "your Mac" while its name is still an address or pairing. */
    val macLabel: String,
    /** How the bar names the machine ("your Mac" / "your Linux host"). */
    val macNoun: String
)
