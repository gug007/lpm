import Foundation
import Security

/// The paired-device credential (deviceId + bearer token) in the iOS Keychain as
/// a single generic-password item. The token authenticates every connection and
/// is the one long-lived secret on the phone, so it must never touch
/// UserDefaults. Accessible after first unlock so a background reconnect works.
enum Keychain {
    private static let service = "cx.lpm.mobile"
    private static let account = "device-credential"

    static func save(deviceId: String, token: String) {
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

    static func load() -> LpmClient.Credential? {
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

    static func clear() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
