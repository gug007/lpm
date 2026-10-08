import Foundation
import Network

/// The iPhone's own network: whether it has one, whether that's Wi-Fi or
/// cellular, and which local subnets the Wi-Fi puts it on. Lets the app react the
/// moment the phone changes networks instead of waiting for a dead socket, and
/// tell "the Mac is asleep" apart from "this isn't the Mac's network".
@Observable @MainActor
final class NetworkWatcher {
    enum Medium: Equatable { case none, wifi, cellular, other }

    struct Subnet: Equatable {
        let address: UInt32
        let mask: UInt32

        func contains(_ ip: UInt32) -> Bool { ip & mask == address & mask }
    }

    private(set) var medium: Medium = .other
    private(set) var subnets: [Subnet] = []

    /// Called after the phone settles on a different network (debounced, since a
    /// handover reports several paths in a row).
    @ObservationIgnored var onChange: ((_ from: Medium, _ to: Medium) -> Void)?

    @ObservationIgnored private var monitor: NWPathMonitor?
    @ObservationIgnored private var settle: DispatchWorkItem?
    // What was last reported, so a change can be told apart from a repeat; nil
    // until the first path, which is only a baseline.
    @ObservationIgnored private var reported: (medium: Medium, subnets: [Subnet])?

    var isOnline: Bool { medium != .none }

    func start() {
        guard monitor == nil else { return }
        let monitor = NWPathMonitor()
        monitor.pathUpdateHandler = { [weak self] path in
            let medium = Self.medium(of: path)
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.apply(medium) }
            }
        }
        monitor.start(queue: DispatchQueue(label: "cx.lpm.network"))
        self.monitor = monitor
    }

    /// True when `host` is an IPv4 address on a subnet this phone's Wi-Fi is on —
    /// i.e. the phone is on the same network as that address.
    func sharesSubnet(with host: String) -> Bool {
        guard medium == .wifi, let ip = Self.ipv4(host) else { return false }
        return subnets.contains { $0.contains(ip) }
    }

    private func apply(_ next: Medium) {
        medium = next
        subnets = next == .wifi ? Self.wifiSubnets() : []
        settle?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            let now = (medium: self.medium, subnets: self.subnets)
            guard let from = self.reported else { self.reported = now; return }
            guard from.medium != now.medium || from.subnets != now.subnets else { return }
            self.reported = now
            self.onChange?(from.medium, now.medium)
        }
        settle = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6, execute: work)
    }

    private nonisolated static func medium(of path: NWPath) -> Medium {
        guard path.status == .satisfied else { return .none }
        if path.usesInterfaceType(.wifi) || path.usesInterfaceType(.wiredEthernet) { return .wifi }
        if path.usesInterfaceType(.cellular) { return .cellular }
        return .other
    }

    /// The IPv4 subnets of the phone's Wi-Fi and wired interfaces.
    private static func wifiSubnets() -> [Subnet] {
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0, let first = head else { return [] }
        defer { freeifaddrs(head) }
        var out: [Subnet] = []
        for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let ifa = entry.pointee
            let name = String(cString: ifa.ifa_name)
            guard name.hasPrefix("en"), let addr = ifa.ifa_addr, let mask = ifa.ifa_netmask,
                  addr.pointee.sa_family == UInt8(AF_INET) else { continue }
            let a = addr.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            let m = mask.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { UInt32(bigEndian: $0.pointee.sin_addr.s_addr) }
            if a != 0 { out.append(Subnet(address: a, mask: m)) }
        }
        return out
    }

    nonisolated static func ipv4(_ host: String) -> UInt32? {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4 else { return nil }
        var value: UInt32 = 0
        for part in parts {
            guard let octet = UInt32(part), octet <= 255 else { return nil }
            value = value << 8 | octet
        }
        return value
    }
}
