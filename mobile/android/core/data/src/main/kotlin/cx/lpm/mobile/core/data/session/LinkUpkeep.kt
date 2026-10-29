package cx.lpm.mobile.core.data.session

import cx.lpm.mobile.core.data.client.LpmClient
import cx.lpm.mobile.core.data.link.AddressKind
import cx.lpm.mobile.core.data.link.ConnectionIssue
import cx.lpm.mobile.core.data.link.IssueAction
import cx.lpm.mobile.core.data.link.NetworkMonitor.Medium
import cx.lpm.mobile.core.data.link.ReconnectReason
import cx.lpm.mobile.core.data.mac.Farewell
import cx.lpm.mobile.core.data.projects.ProjectsStore
import java.time.Instant
import kotlinx.coroutines.launch
import kotlinx.coroutines.yield

/**
 * Keeping the link to the active Mac honest (iOS `AppModel+Link`): the saved list
 * shown while the Mac is away, what the Mac said on its way out, and following the
 * phone from one network to another.
 */
internal class LinkUpkeep(private val s: MacSession) {
    // Guards the opportunistic host migration against overlapping re-probes.
    private var repicking = false

    private val projects: ProjectsStore?
        get() = s.stores.filterIsInstance<ProjectsStore>().firstOrNull()

    /**
     * Show the active Mac's last saved project list until a live one arrives —
     * without its agents' states, which have moved on since.
     */
    fun restoreSnapshot() {
        val projects = projects ?: return
        val id = s.state.value.activeMacId
        if (s.state.value.demoMode || id == null) return
        if (projects.state.value.projects.isNotEmpty()) return
        val snapshot = s.env.snapshots.load(id) ?: return
        projects.restore(snapshot)
        s.link.update { it.copy(listAsOf = snapshot.at) }
    }

    /** The live link ended: remember when it was last current. */
    fun noteLeavingActiveMac(asOf: Instant) {
        val id = s.state.value.activeMacId
        if (s.state.value.demoMode || s.link.state.value.pairing || id == null) return
        if (s.state.value.macs.none { it.localId == id }) return
        s.updateMac(id) { it.copy(lastConnected = asOf) }
        s.persistMacs()
        if (!s.isVisit) s.env.snapshots.touch(id, asOf)
        if (projects?.state?.value?.projects?.isNotEmpty() == true) {
            s.link.update { it.copy(listAsOf = asOf) }
        }
    }

    /** The link came up: whatever the Mac said on its way out no longer applies. */
    fun noteConnected(c: LpmClient) {
        s.link.update { it.copy(host = c.host) }
        if (s.state.value.demoMode || s.link.state.value.pairing) return
        val id = s.state.value.activeMacId ?: return
        if (s.state.value.macs.none { it.localId == id }) return
        val now = s.env.clock.instant()
        s.updateMac(id) { it.copy(farewell = null, lastConnected = now) }
        s.persistMacs()
    }

    /** The Mac kept talking after it said goodbye: forget the goodbye. */
    fun withdrawFarewell() {
        val record = s.state.value.activeRecord ?: return
        if (record.farewell == null) return
        s.updateMac(record.localId) { it.copy(farewell = null) }
        s.persistMacs()
    }

    /** The Mac is closing the connection on purpose and said why. */
    fun noteFarewell(reason: String, at: Instant) {
        if (s.state.value.demoMode) return
        val why = Farewell.Reason.of(reason) ?: return
        val record = s.state.value.activeRecord ?: return
        s.updateMac(record.localId) { it.copy(farewell = Farewell(why, at)) }
        s.persistMacs()
    }

    /** The phone moved between Wi-Fi, cellular and offline. */
    fun networkChanged(from: Medium, to: Medium) {
        s.visitSession.value?.networkChanged(from, to)
        if (to == Medium.None || s.state.value.demoMode) return
        val reason = when {
            from == Medium.None -> ReconnectReason.BackOnline
            to == Medium.Wifi -> ReconnectReason.JoinedWiFi
            else -> ReconnectReason.LeftWiFi
        }
        rehome(reason)
        s.link.refreshReach(force = true)
    }

    /** Built-in Tailscale changed state; once it's up, its addresses work. */
    fun tailnetChanged(state: String) {
        s.visitSession.value?.tailnetChanged(state)
        if (state != "running") return
        s.link.tailnetCameUp()
        if (s.state.value.isReady) return
        rehome(null)
    }

    /**
     * Point the live client at whichever saved address answers from the network the
     * phone is on now. One that still works there is only re-checked; anything else
     * is moved without losing what the phone was watching.
     */
    fun rehome(reason: ReconnectReason?) {
        // Pairing owns the connection while it runs, a probe in flight dials on its
        // own, and no address change fixes an identity or credential the Mac refuses.
        val st = s.state.value
        val link = s.link.state.value
        val busy = link.pairing || st.addingMac || st.approvalPairing != null || s.probing
        val refused = link.identityRejected || st.identityMismatch || st.needsRepair
        if (st.demoMode || busy || refused) return
        val credential = s.activeCredential() ?: return
        val c = s.client
        if (c == null || c.deviceId == null) {
            if (c == null) s.connectBest(credential)
            return
        }
        if (st.isReady && stillWorks(c.host)) return c.verifyNow()
        if (reason != null) s.link.update { it.copy(reconnectReason = reason) }
        s.scope.launch {
            val race = s.env.prober.race(
                s.savedHosts(),
                s.savedPort(),
                s.probeIdentity(s.state.value.activeRecord)
            )
            s.link.noteProbe(race.outcomes)
            if (c !== s.client) return@launch
            val winner = race.winner
            when {
                winner != null && winner != c.host -> moveLink(c, winner)
                s.state.value.isReady -> c.verifyNow()
                else -> c.retryNow()
            }
        }
    }

    /**
     * A live client only retries the one host it was built with, so a phone that
     * roams keeps hammering an address that's now unroutable. Once its retries stop
     * being patient (an offline hint), re-probe the saved hosts and migrate to a
     * different one that answers. Each slow retry re-emits the hint, so this
     * re-probes periodically with no timer of its own.
     */
    fun repickHostIfStale(state: LpmClient.State, c: LpmClient) {
        if (state !is LpmClient.State.Failed || !LpmClient.isOfflineHint(state.message)) return
        if (c !== s.client || repicking) return
        val credential = s.activeCredential() ?: return
        repicking = true
        s.scope.launch {
            try {
                val race = s.env.prober.race(
                    s.savedHosts(),
                    s.savedPort(),
                    s.probeIdentity(s.state.value.activeRecord)
                )
                s.link.noteProbe(race.outcomes)
                val winner = race.winner ?: return@launch
                if (winner == s.currentHost || c !== s.client) return@launch
                if (c.deviceId != null) {
                    moveLink(c, winner)
                } else {
                    s.connect(winner, s.savedPort(), credential)
                }
            } finally {
                repicking = false
            }
        }
    }

    fun perform(action: IssueAction, issue: ConnectionIssue) {
        when (action) {
            IssueAction.Retry -> s.retryConnection()

            IssueAction.PairAgain -> if (issue == ConnectionIssue.RemovedOnMac) {
                s.repairRemovedMac()
            } else {
                val identity = issue == ConnectionIssue.IdentityChanged ||
                    issue == ConnectionIssue.IdentityRejected
                s.repairActiveMac(if (identity) RepairReason.Identity else null)
            }

            IssueAction.CompareCode -> {
                // Re-raise it: a sheet that couldn't appear over another one left the
                // flag set with nothing on screen.
                s.link.update { it.copy(identityCheckOpen = false) }
                s.scope.launch {
                    yield()
                    s.link.update { it.copy(identityCheckOpen = true) }
                }
            }

            IssueAction.TurnOnTailscale, IssueAction.SignInTailscale -> s.link.turnOnTailscale()

            IssueAction.TailscaleSettings -> s.link.update { it.copy(tailscaleSettingsOpen = true) }

            IssueAction.Details -> s.link.update { it.copy(sheetOpen = true) }

            IssueAction.Wake -> s.wake.wakeActive()

            IssueAction.OpenAdmin, IssueAction.PhoneSettings, IssueAction.EnterNewCode -> Unit
        }
    }

    fun moveLink(c: LpmClient, host: String) {
        s.currentHost = host
        s.link.update { it.copy(host = host) }
        c.move(host)
    }

    // One that works from anywhere, or a home address on the Wi-Fi it belongs to.
    private fun stillWorks(host: String): Boolean {
        val kind = AddressKind.of(host)
        val onItsWifi = s.env.network.network.value.sharesSubnet(host)
        return kind.worksAway || onItsWifi || kind == AddressKind.ThisDevice
    }
}
