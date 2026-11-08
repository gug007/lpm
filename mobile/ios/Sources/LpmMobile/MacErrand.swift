import Foundation

/// A short-lived connection to one saved Mac that does a single thing and hangs
/// up: registering for pushes, answering from a notification, registering a Live
/// Activity — work that has to reach a Mac the app isn't talking to, or happens
/// while the app was woken in the background and has no live session at all.
///
/// Its client subscribes to nothing and takes control of nothing, so it can't
/// disturb what the app shows.
@MainActor
final class MacErrand {
    private static let probeTimeout: TimeInterval = 6
    // Nothing else holds an errand while it runs: the client's callbacks and the
    // watchdog are weak, so a dropped one would never finish.
    private static var running: [ObjectIdentifier: MacErrand] = [:]

    private var client: LpmClient?
    private var watchdog: DispatchWorkItem?
    private var completion: ((Bool) -> Void)?

    /// The saved Mac a push came from, by its server id; one opened through
    /// another Mac doesn't know this phone.
    static func mac(serverId: String?) -> MacRecord? {
        guard let serverId, !serverId.isEmpty else { return nil }
        return MacStore.loadRecords().first { $0.serverId == serverId && $0.via == nil }
    }

    /// Dial `mac`, hand the ready client to `work`, and finish when `work` calls
    /// its `done` — or on a failed connection or the timeout, with false.
    static func run(to mac: MacRecord, deviceName: String, timeout: TimeInterval,
                    onIdentity: ((_ serverId: String?, _ serverName: String?, _ platform: String?) -> Void)? = nil,
                    work: @escaping (LpmClient, @escaping (Bool) -> Void) -> Void) async -> Bool {
        guard let credential = Keychain.load(for: mac.localId) else { return false }
        let port = Int(mac.port)
        guard let host = await HostProbe.firstReachable(mac.hosts, port: port, timeout: probeTimeout)
        else { return false }
        let errand = MacErrand()
        let id = ObjectIdentifier(errand)
        running[id] = errand
        defer { running[id] = nil }
        return await withCheckedContinuation { continuation in
            errand.start(host: host, port: port, credential: credential, mac: mac,
                         deviceName: deviceName, timeout: timeout, onIdentity: onIdentity,
                         work: work) { ok in
                continuation.resume(returning: ok)
            }
        }
    }

    private func start(host: String, port: Int, credential: MacCredential, mac: MacRecord,
                       deviceName: String, timeout: TimeInterval,
                       onIdentity: ((String?, String?, String?) -> Void)?,
                       work: @escaping (LpmClient, @escaping (Bool) -> Void) -> Void,
                       completion: @escaping (Bool) -> Void) {
        self.completion = completion
        let localId = mac.localId
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: credential,
                          deviceName: deviceName,
                          pinProvider: { Keychain.loadPin(for: localId) })
        client = c
        c.onState = { [weak self, weak c] state in
            switch state {
            case .ready:
                guard let c else { return }
                work(c) { [weak self] ok in self?.finish(ok) }
            case .failed: self?.finish(false)
            case .idle, .connecting: break
            }
        }
        c.onIdentity = onIdentity
        let w = DispatchWorkItem { [weak self] in self?.finish(false) }
        watchdog = w
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: w)
        c.connect()
    }

    private func finish(_ ok: Bool) {
        guard let completion else { return }
        self.completion = nil
        watchdog?.cancel()
        watchdog = nil
        // Dropped before the teardown: `shutdown()` sets the client to `.idle`,
        // which would otherwise re-enter `onState` on a finished errand.
        client?.onState = nil
        client?.onIdentity = nil
        client?.onApnsToken = nil
        client?.onAnswerAgent = nil
        client?.onLiveActivity = nil
        client?.shutdown()
        client = nil
        completion(ok)
    }
}
