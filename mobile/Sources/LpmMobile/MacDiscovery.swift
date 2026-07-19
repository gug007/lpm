import Foundation
import Network

/// Browses the local network for Macs running lpm and publishes what it finds.
/// Each Mac advertises a service carrying its stable identity, human name, and a
/// dev-build flag; resolving one yields a concrete address + port the phone can
/// connect to. Browsing is explicitly scoped: `start()` only while the pairing
/// screen is up or a recovery attempt is running, `stop()` the moment it isn't —
/// so the phone never holds an open browse in the background.
@MainActor
@Observable
final class MacDiscovery {
    /// One advertised Mac. `serverId` is the Mac's stable identity (matched against
    /// saved records); `name` is its display name; `isDev` marks a development
    /// build. `endpoint` is opaque — pass it to `resolve` to get an address.
    struct DiscoveredMac: Identifiable, Equatable {
        let serverId: String?
        let name: String
        let isDev: Bool
        let endpoint: NWEndpoint

        var id: String { serverId ?? String(describing: endpoint) }

        static func == (lhs: DiscoveredMac, rhs: DiscoveredMac) -> Bool {
            lhs.id == rhs.id && lhs.serverId == rhs.serverId
                && lhs.name == rhs.name && lhs.isDev == rhs.isDev
        }
    }

    private(set) var found: [DiscoveredMac] = []
    /// Called on every change to `found`, so a non-view owner (recovery in the app
    /// model) can react without observing the property.
    var onChange: (([DiscoveredMac]) -> Void)?

    @ObservationIgnored private var browser: NWBrowser?

    /// Begin browsing. Idempotent — a second call while already browsing is a no-op.
    func start() {
        guard browser == nil else { return }
        let params = NWParameters()
        params.includePeerToPeer = false
        let browser = NWBrowser(for: .bonjourWithTXTRecord(type: "_lpm._tcp", domain: nil), using: params)
        browser.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self else { return }
            MainActor.assumeIsolated { self.apply(results) }
        }
        browser.stateUpdateHandler = { [weak self] state in
            guard let self, case .failed = state else { return }
            MainActor.assumeIsolated { self.restart() }
        }
        self.browser = browser
        browser.start(queue: .main)
    }

    /// Stop browsing and drop the current results.
    func stop() {
        browser?.cancel()
        browser = nil
        if !found.isEmpty {
            found = []
            onChange?(found)
        }
    }

    private func restart() {
        browser?.cancel()
        browser = nil
        start()
    }

    private func apply(_ results: Set<NWBrowser.Result>) {
        var macs: [DiscoveredMac] = []
        for result in results {
            guard case .service(let serviceName, _, _, _) = result.endpoint else { continue }
            var serverId: String?
            var name = ""
            var isDev = false
            if case .bonjour(let txt) = result.metadata {
                serverId = txt.string("id")
                name = txt.string("name") ?? ""
                isDev = txt.string("dev") == "1"
            }
            if name.isEmpty { name = serviceName }
            macs.append(DiscoveredMac(serverId: serverId, name: name, isDev: isDev, endpoint: result.endpoint))
        }
        macs.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        guard macs != found else { return }
        found = macs
        onChange?(found)
    }

    /// Resolve a discovered service to a concrete `(host, port)`. Opens a brief
    /// connection to the advertised service and reads the address the OS resolved
    /// it to, preferring IPv4 (LAN Macs advertise an A record); if that can't be
    /// reached it retries without the IPv4 constraint. Returns nil on timeout.
    func resolve(_ mac: DiscoveredMac, timeout: TimeInterval = 5) async -> (host: String, port: UInt16)? {
        if let hp = await connectAndRead(mac.endpoint, forceIPv4: true, timeout: timeout) { return hp }
        return await connectAndRead(mac.endpoint, forceIPv4: false, timeout: timeout)
    }

    private func connectAndRead(_ endpoint: NWEndpoint, forceIPv4: Bool, timeout: TimeInterval) async -> (host: String, port: UInt16)? {
        let params = NWParameters.tcp
        if forceIPv4, let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
            ip.version = .v4
        }
        let conn = NWConnection(to: endpoint, using: params)
        let box = ContinuationBox()
        return await withCheckedContinuation { (cont: CheckedContinuation<(host: String, port: UInt16)?, Never>) in
            box.attach(cont)
            conn.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    box.finish(MacDiscovery.hostPort(conn.currentPath?.remoteEndpoint))
                    conn.cancel()
                case .failed, .cancelled:
                    box.finish(nil)
                    conn.cancel()
                default:
                    break
                }
            }
            conn.start(queue: .global())
            DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
                box.finish(nil)
                conn.cancel()
            }
        }
    }

    /// Pull the concrete host + port out of a resolved endpoint. IPv6 zone ids
    /// (`%en0`) are stripped so the address forms a plain `ws://host:port/`.
    private nonisolated static func hostPort(_ endpoint: NWEndpoint?) -> (host: String, port: UInt16)? {
        guard case .hostPort(let host, let port) = endpoint else { return nil }
        let p = port.rawValue
        switch host {
        case .ipv4(let addr):
            return ("\(addr)", p)
        case .ipv6(let addr):
            let s = "\(addr)"
            return (s.split(separator: "%").first.map(String.init) ?? s, p)
        case .name(let n, _):
            return (n, p)
        @unknown default:
            return nil
        }
    }
}

/// Resolves a resolution continuation exactly once, whichever of the connection
/// becoming ready, failing, or the timeout gets there first. `@unchecked
/// Sendable` because access is serialized by the lock.
private final class ContinuationBox: @unchecked Sendable {
    private let lock = NSLock()
    private var done = false
    private var cont: CheckedContinuation<(host: String, port: UInt16)?, Never>?

    func attach(_ c: CheckedContinuation<(host: String, port: UInt16)?, Never>) {
        lock.lock()
        cont = c
        lock.unlock()
    }

    func finish(_ value: (host: String, port: UInt16)?) {
        lock.lock()
        if done { lock.unlock(); return }
        done = true
        let pending = cont
        cont = nil
        lock.unlock()
        pending?.resume(returning: value)
    }
}

private extension NWTXTRecord {
    func string(_ key: String) -> String? {
        if case .string(let s) = getEntry(for: key) { return s }
        return nil
    }
}
