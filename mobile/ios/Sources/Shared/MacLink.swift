import CryptoKit
import Security
import Foundation

/// A paired Mac's credential for this phone: its device id and bearer token.
struct MacCredential {
    let deviceId: String
    let token: String
}

/// Forms `wss://` URLs from any saved host form, shared by the live socket and
/// the reachability probe. `URL(string:)` returns nil for a bare IPv6 literal —
/// and a nil URL used to dead-end the connection state machine — so IPv6 hosts
/// (kept deliberately as an away-from-home fallback) are bracketed here, with
/// any zone id's `%` percent-encoded per RFC 6874. Hostnames, IPv4 literals,
/// and already-bracketed input pass through unchanged.
enum WssURL {
    static func make(host: String, port: Int) -> URL? {
        URL(string: "wss://\(urlHost(host)):\(port)/")
    }

    private static func urlHost(_ host: String) -> String {
        let trimmed = host.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains(":"), !trimmed.hasPrefix("[") else { return trimmed }
        return "[\(trimmed.replacingOccurrences(of: "%", with: "%25"))]"
    }
}

/// Certificate-identity helpers shared by the live socket and the reachability
/// probe: the pinned identity is the lowercase hex SHA-256 of the leaf
/// certificate's DER encoding.
enum CertPinning {
    static func leafFingerprint(_ trust: SecTrust) -> String? {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first else { return nil }
        let der = SecCertificateCopyData(leaf) as Data
        return sha256Hex(der)
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
