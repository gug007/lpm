import Foundation
import UIKit

/// Open lpm: when lpm was closed on the active Mac, its login helper (on the port
/// `ready` named as `launcher`) starts it, and the link reconnects once it's up.
extension AppModel {
    /// Long enough for a cold start, which the helper waits out before it answers.
    private static let openLpmTimeout: TimeInterval = 100

    var canOpenLpm: Bool { !demoMode && activeRecord?.launcher != nil }

    func rememberLauncher(serverId: String?, port: Int?) {
        guard !demoMode, let sid = serverId, !sid.isEmpty,
              let idx = macs.firstIndex(where: { $0.serverId == sid && $0.via == nil }) else { return }
        guard macs[idx].launcher != port else { return }
        macs[idx].launcher = port
        persistMacs()
    }

    func openLpmOnActiveMac() {
        guard let mac = activeRecord, let port = mac.launcher, !link.openingLpm else { return }
        link.openingLpm = true
        let deviceName = UIDevice.current.name
        Task { @MainActor [weak self] in
            var refusal: String?
            let ok = await MacErrand.run(to: mac, port: port, deviceName: deviceName,
                                         timeout: Self.openLpmTimeout) { client, done in
                guard client.hostFeatures.contains(LpmClient.launchLpmFeature) else { return done(false) }
                client.onLaunchLpm = { error in
                    refusal = error
                    done(error == nil)
                }
                client.launchLpm()
            }
            guard let self else { return }
            self.link.openingLpm = false
            guard self.activeMacId == mac.localId else { return }
            if ok {
                Haptics.success()
                self.retryConnection()
            } else {
                self.actionError = refusal
                    ?? "Couldn't reach \(mac.displayName). Opening lpm from here works on the same network or over the Tailscale app."
            }
        }
    }
}
