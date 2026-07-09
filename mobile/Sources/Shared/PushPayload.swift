import Foundation
import CryptoKit

/// Opens an lpm push blob: a base64 `nonce(12) || ciphertext || tag(16)` sealed box
/// (AES-256-GCM) under the shared push key, decoded to its JSON object. Returns nil
/// on any failure so callers can fall back safely and never crash on garbage.
///
/// Shared by the notification service extension (alert rewrite) and the app
/// (background clear handling), which both open the same combined format.
enum PushPayload {
    static func open(blob: String) -> [String: Any]? {
        guard let sealed = Data(base64Encoded: blob),
              let keyData = PushKey.load(),
              let box = try? AES.GCM.SealedBox(combined: sealed),
              let plaintext = try? AES.GCM.open(box, using: SymmetricKey(data: keyData)),
              let payload = try? JSONSerialization.jsonObject(with: plaintext) as? [String: Any]
        else { return nil }
        return payload
    }

    /// A collision-free identity for a delivered notification's (project, status
    /// entry key) pair, used to match clear entries and reconcile against live
    /// status. The null separator can't appear in either component.
    static func statusIdentity(project: String, statusKey: String) -> String {
        project + "\u{0}" + statusKey
    }
}
