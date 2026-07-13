import Foundation

/// One saved Mac the phone can connect to. The phone keeps several of these but
/// talks to exactly one at a time (the active record). `localId` is the stable
/// key the phone owns — it names the per-Mac Keychain credential and survives even
/// before the Mac has told us its `serverId`. `serverId` is the Mac's own stable
/// identity (learned from the handshake), used to recognize a Mac we already saved
/// when it's re-paired. `hosts` are the addresses to race (LAN + Tailscale).
struct MacRecord: Codable, Identifiable, Equatable {
    let localId: UUID
    var serverId: String?
    // The learned name — the Mac's server-provided computer name, or its first host
    // until that's known. Refreshed on every connect; never a user's choice.
    var name: String
    // A name the user typed for this Mac. Wins over `name` for display and is never
    // overwritten by learning/re-pairing, so a rename survives reconnects. Absent
    // from records saved before this feature — decodes as nil (Optional + default).
    var customName: String? = nil
    var hosts: [String]
    var port: UInt16

    var id: UUID { localId }

    /// What to show wherever this Mac is named: the user's custom name if set,
    /// otherwise the learned name (which may still be a raw address).
    var displayName: String {
        if let custom = trimmedCustomName { return custom }
        return name
    }

    /// True when the *displayed* name is really just a network address, not a
    /// friendly Mac name. A user rename is always treated as a real name. Migrated
    /// / not-yet-identified Macs seed `name` from their first host, so until the
    /// Mac's `serverName` is learned the name is a raw IP — detected by matching a
    /// known host or by looking like an address.
    var isAddressName: Bool {
        if trimmedCustomName != nil { return false }
        let trimmed = name.trimmingCharacters(in: .whitespaces)
        if hosts.contains(trimmed) { return true }
        return MacRecord.looksLikeAddress(trimmed)
    }

    /// The address to show/speak when `isAddressName` is true — the name itself is
    /// the address; otherwise the first host as a fallback.
    var displayAddress: String {
        isAddressName ? name.trimmingCharacters(in: .whitespaces) : (hosts.first ?? displayName)
    }

    private var trimmedCustomName: String? {
        guard let c = customName?.trimmingCharacters(in: .whitespacesAndNewlines), !c.isEmpty else { return nil }
        return c
    }

    private static func looksLikeAddress(_ s: String) -> Bool {
        if s.isEmpty { return false }
        // IPv4: four 0–255 octets.
        let octets = s.split(separator: ".", omittingEmptySubsequences: false)
        if octets.count == 4, octets.allSatisfy({ Int($0).map { (0...255).contains($0) } ?? false }) {
            return true
        }
        // IPv6: contains a colon and only hex digits / colons (allowing a %zone).
        if s.contains(":") {
            let core = s.split(separator: "%", maxSplits: 1).first.map(String.init) ?? s
            let allowed = CharacterSet(charactersIn: "0123456789abcdefABCDEF:")
            if core.unicodeScalars.allSatisfy({ allowed.contains($0) }) { return true }
        }
        return false
    }
}
