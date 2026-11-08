import Foundation

/// Tells a Mac the user removed it from this phone, so it drops this phone's
/// device record instead of trusting — and pushing to — a credential the phone no
/// longer has. One short-lived connection per address, on the pinned certificate
/// only. Removal never waits for it: a Mac that can't be reached now stays in
/// `PendingUnpairs` and is told the next time the app comes forward, for a month.
@MainActor
enum MacUnpair {
    private static let timeout: TimeInterval = 8
    private static let giveUpAfter: TimeInterval = 30 * 24 * 60 * 60
    private static var inFlight: Set<String> = []

    static func send(hosts: [String], port: Int, credential: MacCredential, pin: String?) {
        // Without a pin, whoever answers at the address could be anyone; the token
        // isn't handed to them.
        guard let pin else { return }
        let item = PendingUnpairs.Item(deviceId: credential.deviceId, token: credential.token,
                                       pin: pin, hosts: hosts, port: port, since: Date())
        PendingUnpairs.add(item)
        attempt(item)
    }

    /// Try again every Mac that hasn't heard yet.
    static func retryPending() {
        for item in PendingUnpairs.all() {
            if Date().timeIntervalSince(item.since) > giveUpAfter {
                PendingUnpairs.remove(deviceId: item.deviceId)
            } else {
                attempt(item)
            }
        }
    }

    private static func attempt(_ item: PendingUnpairs.Item) {
        guard inFlight.insert(item.deviceId).inserted else { return }
        let frame = Wire.unpair(deviceId: item.deviceId, token: item.token, phoneId: Keychain.phoneId)
        Task {
            defer { inFlight.remove(item.deviceId) }
            for host in item.hosts where !host.isEmpty {
                if await deliver(frame, host: host, port: item.port, pin: item.pin) {
                    PendingUnpairs.remove(deviceId: item.deviceId)
                    return
                }
            }
        }
    }

    /// Whether the Mac at `host` no longer holds the record: it just dropped it,
    /// or had already.
    nonisolated private static func deliver(_ frame: String, host: String, port: Int, pin: String) async -> Bool {
        guard let url = LpmClient.Endpoint(host: host, port: port).dialURL() else { return false }
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = timeout
        let session = URLSession(configuration: config,
                                 delegate: PinningDelegate(pinProvider: { pin }, expected: nil),
                                 delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let task = session.webSocketTask(with: url)
        task.resume()
        DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
            task.cancel(with: .goingAway, reason: nil)
        }
        do {
            try await task.send(.string(frame))
            guard case .string(let text) = try await task.receive() else { return false }
            return settled(text)
        } catch {
            return false
        }
    }

    nonisolated static func settled(_ reply: String) -> Bool {
        guard let data = reply.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        if obj["t"] as? String == "unpaired" { return true }
        let error = obj["error"] as? String
        return obj["t"] as? String == "error" && (error == "unauthorized" || error == "revoked")
    }
}

/// Macs removed from this phone that haven't heard it yet. Each holds the
/// credential it signs in with, so the list lives in the Keychain.
@MainActor
enum PendingUnpairs {
    struct Item: Codable, Equatable {
        let deviceId: String
        let token: String
        let pin: String
        let hosts: [String]
        let port: Int
        let since: Date
    }

    static func all() -> [Item] {
        guard let data = Keychain.loadPendingUnpairs() else { return [] }
        return (try? JSONDecoder().decode([Item].self, from: data)) ?? []
    }

    static func add(_ item: Item) {
        save(all().filter { $0.deviceId != item.deviceId } + [item])
    }

    static func remove(deviceId: String) {
        save(all().filter { $0.deviceId != deviceId })
    }

    private static func save(_ items: [Item]) {
        Keychain.savePendingUnpairs(items.isEmpty ? nil : try? JSONEncoder().encode(items))
    }
}
