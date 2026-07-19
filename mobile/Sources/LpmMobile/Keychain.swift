import Foundation
import Security

/// Paired-device credentials (deviceId + bearer token) in the iOS Keychain, one
/// generic-password item per saved Mac. The token authenticates every connection
/// and is the one long-lived secret on the phone, so it must never touch
/// UserDefaults. Accessible after first unlock so a background reconnect works.
///
/// Each Mac's credential lives under account `device-credential.<localId>`. The
/// old single-item account (`device-credential`) is read only for the one-time
/// migration to per-Mac records.
enum Keychain {
    private static let service = "cx.lpm.mobile"
    private static let legacyAccount = "device-credential"

    private static func account(for localId: UUID) -> String {
        "device-credential.\(localId.uuidString)"
    }

    private static func pinAccount(for localId: UUID) -> String {
        "cert-pin.\(localId.uuidString)"
    }

    static func save(deviceId: String, token: String, for localId: UUID) {
        saveCredential(deviceId: deviceId, token: token, account: account(for: localId))
    }

    static func load(for localId: UUID) -> LpmClient.Credential? {
        loadCredential(account: account(for: localId))
    }

    static func delete(for localId: UUID) {
        deleteCredential(account: account(for: localId))
        deleteCredential(account: pinAccount(for: localId))
    }

    // MARK: certificate pin (trust-on-first-use)

    /// The pinned leaf-cert fingerprint for a Mac, stored alongside its credential
    /// so it survives exactly like the token does. Nil means "not yet pinned".
    static func loadPin(for localId: UUID) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: pinAccount(for: localId),
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data, let pin = String(data: data, encoding: .utf8)
        else { return nil }
        return pin
    }

    static func savePin(_ fingerprint: String, for localId: UUID) {
        guard let data = fingerprint.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: pinAccount(for: localId),
        ]
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    static func deletePin(for localId: UUID) {
        deleteCredential(account: pinAccount(for: localId))
    }

    // MARK: legacy single-item (pre multi-Mac) — migration only

    static func loadLegacy() -> LpmClient.Credential? {
        loadCredential(account: legacyAccount)
    }

    static func clearLegacy() {
        deleteCredential(account: legacyAccount)
    }

    // MARK: shared implementation

    private static func saveCredential(deviceId: String, token: String, account: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: ["deviceId": deviceId, "token": token]) else {
            return
        }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let update: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    private static func loadCredential(account: String) -> LpmClient.Credential? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let id = obj["deviceId"], let token = obj["token"]
        else {
            return nil
        }
        return LpmClient.Credential(deviceId: id, token: token)
    }

    private static func deleteCredential(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
