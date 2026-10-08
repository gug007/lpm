import Foundation

/// What a saved address is, in the terms people set them up in: the Mac's
/// address on its home network, its Tailscale address, and so on. Drives the
/// labels on the address list and whether a connection counts as away from home.
enum AddressKind: Equatable {
    case tailscale
    case home
    case localName
    case thisDevice
    case internet

    static func of(_ raw: String) -> AddressKind {
        let host = raw.trimmingCharacters(in: .whitespaces).lowercased()
        if host == "localhost" || host.hasPrefix("127.") || host == "::1" { return .thisDevice }
        if BuiltInTailscale.isTailnetHost(host) || host.hasPrefix("fd7a:115c:a1e0:") { return .tailscale }
        if let ip = NetworkWatcher.ipv4(host) {
            let a = ip >> 24, b = (ip >> 16) & 0xff
            if a == 10 || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168) || (a == 169 && b == 254) {
                return .home
            }
            return .internet
        }
        if host.contains(":") {
            return host.hasPrefix("fe80") || host.hasPrefix("fc") || host.hasPrefix("fd") ? .home : .internet
        }
        if host.hasSuffix(".local") || !host.contains(".") { return .localName }
        return .internet
    }

    var label: String {
        switch self {
        case .tailscale: return "Tailscale"
        case .home: return "Home network"
        case .localName: return "Name on your network"
        case .thisDevice: return "This device"
        case .internet: return "Internet address"
        }
    }

    /// Reachable from any network, not just the Mac's own.
    var worksAway: Bool { self == .tailscale || self == .internet }
}
