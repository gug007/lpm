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
    private static let phoneIdAccount = "phone-id"
    private static let pendingUnpairsAccount = "pending-unpairs"
    private static let phoneIdDefaultsKey = "lpm.phoneId"

    private static func account(for localId: UUID) -> String {
        "device-credential.\(localId.uuidString)"
    }

    private static func pinAccount(for localId: UUID) -> String {
        "cert-pin.\(localId.uuidString)"
    }

    static func save(deviceId: String, token: String, for localId: UUID) {
        saveCredential(deviceId: deviceId, token: token, account: account(for: localId))
    }

    static func load(for localId: UUID) -> MacCredential? {
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

    // MARK: Macs still to be told they were removed (MacUnpair)

    static func loadPendingUnpairs() -> Data? {
        loadData(account: pendingUnpairsAccount)
    }

    static func savePendingUnpairs(_ data: Data?) {
        guard let data else { return deleteCredential(account: pendingUnpairsAccount) }
        saveData(data, account: pendingUnpairsAccount)
    }

    // MARK: phone id

    private static var cachedPhoneId: String?
    private static let phoneIdLock = NSLock()

    /// This install's own id, sent in every connection's first frame so a Mac
    /// knows the phone behind any credential, its own or another Mac's. Minted
    /// once and never rotated; UserDefaults holds it only when the Keychain
    /// wouldn't take it.
    static var phoneId: String {
        phoneIdLock.lock()
        defer { phoneIdLock.unlock() }
        if let cachedPhoneId { return cachedPhoneId }
        var result: CFTypeRef?
        let status = SecItemCopyMatching([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: phoneIdAccount,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ] as CFDictionary, &result)
        if status == errSecSuccess, let data = result as? Data,
           let id = String(data: data, encoding: .utf8), !id.isEmpty {
            cachedPhoneId = id
            return id
        }
        if let id = UserDefaults.standard.string(forKey: phoneIdDefaultsKey) {
            cachedPhoneId = id
            return id
        }
        let id = UUID().uuidString.lowercased()
        // Before the first unlock the Keychain may still hold the id: use a
        // fresh one for now but keep nothing, so the stored one isn't replaced.
        if status == errSecInteractionNotAllowed { return id }
        let add: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: phoneIdAccount,
            kSecValueData as String: Data(id.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        if status != errSecItemNotFound || SecItemAdd(add as CFDictionary, nil) != errSecSuccess {
            UserDefaults.standard.set(id, forKey: phoneIdDefaultsKey)
        }
        cachedPhoneId = id
        return id
    }

    // MARK: legacy single-item (pre multi-Mac) — migration only

    static func loadLegacy() -> MacCredential? {
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
        saveData(data, account: account)
    }

    private static func saveData(_ data: Data, account: String) {
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

    private static func loadCredential(account: String) -> MacCredential? {
        guard let data = loadData(account: account),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String],
              let id = obj["deviceId"], let token = obj["token"]
        else {
            return nil
        }
        return MacCredential(deviceId: id, token: token)
    }

    private static func loadData(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
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
