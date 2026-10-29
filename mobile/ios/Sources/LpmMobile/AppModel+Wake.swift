import UIKit

/// Waking the active Mac when it sleeps (PROTOCOL.md, Waking a sleeping Mac).
extension AppModel {
    private static let wakeErrandTimeout: TimeInterval = 8
    private static let wakeRetries = 6
    private static let wakeRetryGap: UInt64 = 10_000_000_000

    /// Keep what a Mac says it can be woken through.
    func rememberWakeTargets(serverId: String?, targets: [WakeTarget]) {
        guard !demoMode, let sid = serverId, !sid.isEmpty,
              let idx = macs.firstIndex(where: { $0.serverId == sid && $0.via == nil }) else { return }
        let next = targets.isEmpty ? nil : targets
        guard macs[idx].wake != next else { return }
        macs[idx].wake = next
        persistMacs()
    }

    /// Wake signals from this phone and from every other saved machine that
    /// answers, then reconnecting for a minute while the Mac comes up.
    func wakeActiveMac() {
        guard let mac = activeRecord else { return }
        link.wakeSentAt = Date()
        guard !demoMode else { return }
        let targets = mac.wake ?? []
        if mac.via == nil {
            let home = mac.hosts.filter { AddressKind.of($0) == .home }
            MacWaker.wake(targets: targets, homeHosts: home, port: mac.port)
        }
        if !targets.isEmpty { askOthersToWake(mac, targets: targets) }
        retryWhileWaking(mac.localId)
    }

    private func askOthersToWake(_ mac: MacRecord, targets: [WakeTarget]) {
        let others = macs.filter { $0.localId != mac.localId && $0.via == nil }
        let deviceName = UIDevice.current.name
        let port = Int(mac.port)
        for other in others {
            Task {
                _ = await MacErrand.run(to: other, deviceName: deviceName, timeout: Self.wakeErrandTimeout) { client, done in
                    guard client.hostFeatures.contains(LpmClient.wakeFeature) else { return done(false) }
                    client.onWake = { done($0) }
                    client.requestWake(targets: targets, port: port)
                }
            }
        }
    }

    private func retryWhileWaking(_ localId: UUID) {
        wakeRetry?.cancel()
        wakeRetry = Task { @MainActor [weak self] in
            for _ in 0..<Self.wakeRetries {
                try? await Task.sleep(nanoseconds: Self.wakeRetryGap)
                guard !Task.isCancelled, let self, self.activeMacId == localId else { return }
                if case .ready = self.connection { return }
                self.retryConnection()
            }
        }
    }
}
