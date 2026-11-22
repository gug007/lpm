package cx.lpm.mobile.core.data.link

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.link.NetworkMonitor.Medium
import cx.lpm.mobile.core.data.prefs.PreferenceKeys

// What the connection UI reads, derived from the link, the session, the network and
// Built-in Tailscale — recomputed by [LinkStore.views] whenever any of them changes.

private val LinkStore.network: NetworkMonitor.Network get() = env.network.network.value

fun LinkStore.view(): LinkView {
    val issue = issue()
    val visible = issue?.takeUnless { it.isConnecting && !state.value.slowConnect }
    val s = session.state.value
    val canOpenLpm = !s.demoMode && s.activeRecord?.launcher != null
    return LinkView(
        issue = issue,
        visibleIssue = visible,
        barIssue = visible?.takeIf { it.needsYou(canOpenLpm) },
        quietReconnect = issue?.isConnecting == true && !state.value.slowConnect,
        statusLine = statusLine(issue),
        macLabel = macLabel(),
        macNoun = macNoun()
    )
}

fun LinkStore.issue(): ConnectionIssue? = facts()?.let(ConnectionIssue::derive)

/** How a sentence names the machine — never another one's name while pairing. */
fun LinkStore.macLabel(): String {
    val s = session.state.value
    val record = s.activeRecord
    if (state.value.pairing || s.addingMac || record == null) return "your Mac"
    if (!record.isAddressName) return record.displayName
    return if (record.isLinuxHost) "your Linux host" else "your Mac"
}

fun LinkStore.macNoun(): String {
    val linux = !state.value.pairing && session.state.value.activeRecord?.isLinuxHost == true
    return if (linux) "your Linux host" else "your Mac"
}

fun LinkStore.facts(): LinkFacts? {
    val s = session.state.value
    val link = state.value
    if (s.demoMode || !(link.pairing || s.activeRecord != null)) return null
    val hosts = if (link.pairing) listOfNotNull(link.host) else s.linkRecord?.hosts.orEmpty()
    val lastFailure = link.lastFailure
    val connection = if (s.connection == LpmClient.State.Connecting && lastFailure != null) {
        LpmClient.State.Failed(lastFailure)
    } else {
        s.connection
    }
    return LinkFacts(
        state = connection,
        pairing = link.pairing,
        pairingOverTailscale =
            link.pairing && hosts.any { AddressKind.of(it) == AddressKind.Tailscale },
        needsRepair = s.needsRepair,
        credentialMissing =
            !link.pairing && s.connection == LpmClient.State.Idle && session.client == null,
        identityMismatch = s.identityMismatch,
        identityRejected = link.identityRejected,
        online = network.isOnline,
        onCellular = network.medium == Medium.Cellular,
        atHome = atHome(hosts),
        hasAwayAddress = hosts.any { AddressKind.of(it).worksAway },
        usesTailscaleApp = env.prefs.bool(PreferenceKeys.USES_TAILSCALE_APP) ?: false,
        tailscaleEnabled = env.tailnet.enabled.value,
        tailscaleState = env.tailnet.state.value,
        probedAllFailed = link.probedAllFailed,
        farewell = if (link.pairing) null else s.activeRecord?.farewell,
        reconnectReason = link.reconnectReason,
        via = if (link.pairing) null else viaName()
    )
}

private fun LinkStore.viaName(): String? {
    val s = session.state.value
    return s.activeRecord?.let(s::viaMac)?.displayName
}

/**
 * On the Mac's own network: the Wi-Fi shares a subnet with one of its IPv4 home
 * addresses — or, when it's saved only by name or IPv6, the phone is on some
 * Wi-Fi, which can't be ruled out.
 */
private fun LinkStore.atHome(hosts: List<String>): Boolean {
    val home = hosts.filter {
        AddressKind.of(it) == AddressKind.Home ||
            AddressKind.of(it) == AddressKind.LocalName
    }
    val ipv4 = home.filter { Hosts.ipv4(it) != null }
    if (ipv4.any(network::sharesSubnet)) return true
    return network.medium == Medium.Wifi && ipv4.isEmpty() && home.isNotEmpty()
}

// Home on the Mac's own network, otherwise an address that works from anywhere.
private fun LinkStore.expectedRoute(): AddressKind? {
    val hosts = session.state.value.linkRecord?.hosts
    if (state.value.pairing || !network.isOnline || hosts == null) return null
    if (network.medium != Medium.Cellular && atHome(hosts)) return AddressKind.Home
    val kinds = hosts.map(AddressKind::of)
    if (AddressKind.Tailscale in kinds) return AddressKind.Tailscale
    return if (AddressKind.Internet in kinds) AddressKind.Internet else null
}

fun LinkStore.statusLine(issue: ConnectionIssue? = issue()): LinkStatusLine {
    val s = session.state.value
    val link = state.value
    return LinkStatusLine.make(
        ready = s.isReady,
        demo = s.demoMode,
        kind = link.host?.let(AddressKind::of),
        issue = issue,
        device = env.device.noun,
        now = now,
        slow = link.slowConnect,
        route = expectedRoute(),
        found = s.recoveryStatus != null,
        via = if (link.pairing) null else viaName()
    )
}
