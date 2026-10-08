import Foundation
import UIKit

/// How the model keeps the link to the active Mac honest: the saved list shown
/// while the Mac is away, what the Mac said on its way out, and following the
/// phone from one network to another.
extension AppModel {
    /// Show the active Mac's last saved project list until a live one arrives.
    func restoreSnapshot() {
        guard !demoMode, projects.isEmpty, let id = activeMacId,
              let snapshot = link.snapshots.load(id) else { return }
        projects = snapshot.projects
        workStatuses = snapshot.workStatuses
        workStatusOrder = snapshot.workStatusOrder
        sidebarOrder = snapshot.sidebarOrder
        groups = snapshot.groups
        link.listAsOf = snapshot.at
    }

    /// The live link to the active Mac just ended: remember when it was last
    /// current, for its saved list and for the Mac picker.
    func noteLeavingActiveMac(asOf: Date = Date()) {
        guard !demoMode, !link.pairing, let id = activeMacId,
              let idx = macs.firstIndex(where: { $0.localId == id }) else { return }
        macs[idx].lastConnected = asOf
        persistMacs()
        link.snapshots.touch(id, at: asOf)
        if !projects.isEmpty { link.listAsOf = asOf }
    }

    /// The link came up: whatever the Mac said on its way out no longer applies.
    /// Anything tapped while it was away goes out with the first live project
    /// list, once it can be checked against what's actually running.
    func noteConnected(_ c: LpmClient) {
        link.host = c.host
        guard !demoMode, !link.pairing else { return }
        if let id = activeMacId, let idx = macs.firstIndex(where: { $0.localId == id }) {
            macs[idx].farewell = nil
            macs[idx].lastConnected = Date()
            persistMacs()
        }
    }

    /// The Mac kept talking after it said goodbye (a sleep that didn't happen,
    /// or one short enough that the connection survived): forget the goodbye.
    func withdrawFarewell() {
        guard let id = activeMacId, let idx = macs.firstIndex(where: { $0.localId == id }),
              macs[idx].farewell != nil else { return }
        macs[idx].farewell = nil
        persistMacs()
    }

    /// The Mac is closing the connection on purpose and said why.
    func noteFarewell(_ reason: String, at: Date) {
        guard !demoMode, let why = Farewell.Reason(rawValue: reason), let id = activeMacId,
              let idx = macs.firstIndex(where: { $0.localId == id }) else { return }
        macs[idx].farewell = Farewell(reason: why, at: at)
        persistMacs()
    }

    /// The phone moved between Wi-Fi, cellular and offline.
    func networkChanged(from: NetworkWatcher.Medium, to: NetworkWatcher.Medium) {
        guard to != .none, !demoMode else { return }
        let reason: ReconnectReason = from == .none ? .backOnline : (to == .wifi ? .joinedWiFi : .leftWiFi)
        rehome(reason: reason)
        link.refreshReach(force: true)
    }

    /// Built-in Tailscale changed state; once it's up, its addresses work.
    func tailnetChanged(_ state: String) {
        guard state == "running" else { return }
        link.tailnetCameUp()
        if case .ready = connection { return }
        rehome(reason: nil)
    }

    /// Point the live client at whichever saved address answers from the network
    /// the phone is on now. A connection on an address that still works there is
    /// only re-checked; anything else is moved without losing what the phone was
    /// watching.
    func rehome(reason: ReconnectReason?) {
        // Pairing owns the connection while it runs, an address probe already in
        // flight dials on its own, and no address change fixes an identity or a
        // credential the Mac refuses.
        guard !demoMode, !link.pairing, !addingMac, approvalPairing == nil, !probing,
              !link.identityRejected, !identityMismatch, !needsRepair,
              let cred = activeCredential() else { return }
        guard let c = client, c.deviceId != nil else {
            if client == nil { connectBest(credential: cred) }
            return
        }
        if case .ready = connection, stillWorks(c.host) {
            c.verifyNow()
            return
        }
        if reason != nil { link.reconnectReason = reason }
        Task { @MainActor in
            let (winner, outcomes) = await HostProbe.race(self.savedHosts(), port: self.savedPort())
            self.link.noteProbe(outcomes)
            guard c === self.client else { return }
            if let winner, winner != c.host {
                self.moveLink(c, to: winner)
            } else if case .ready = self.connection {
                c.verifyNow()
            } else {
                c.retryNow()
            }
        }
    }

    /// Carry out a button an issue offers.
    func perform(_ action: IssueAction, for issue: ConnectionIssue) {
        Haptics.tap()
        switch action {
        case .retry: retryConnection()
        case .pairAgain:
            let identity = issue == .identityChanged || issue == .identityRejected
            repairActiveMac(reason: identity ? .identity : nil)
        case .compareCode:
            // Re-raise it: a sheet that couldn't appear over another one left the
            // flag set with nothing on screen.
            link.identityCheckOpen = false
            DispatchQueue.main.async { self.link.identityCheckOpen = true }
        case .turnOnTailscale, .signInTailscale: link.turnOnTailscale()
        case .tailscaleSettings: link.tailscaleSettingsOpen = true
        case .openAdmin: UIApplication.shared.open(BuiltInTailscale.adminURL)
        case .phoneSettings:
            if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
        case .details: link.sheetOpen = true
        case .enterNewCode: break
        }
    }

    func moveLink(_ c: LpmClient, to host: String) {
        currentHost = host
        link.host = host
        c.move(to: host)
    }

    /// An address that keeps working on the phone's current network: one that
    /// works from anywhere, or a home address on the Wi-Fi it belongs to.
    private func stillWorks(_ host: String) -> Bool {
        AddressKind.of(host).worksAway || link.network.sharesSubnet(with: host)
            || AddressKind.of(host) == .thisDevice
    }
}
