import Foundation

/// Persistence for the saved-Macs list and which one is active. The records live
/// in UserDefaults (`lpm.macs`); credentials live per-Mac in the Keychain (keyed
/// by `MacRecord.localId`). Also owns the one-time migration from the old
/// single-Mac layout (a lone Keychain item plus flat `lpm.host`/`lpm.hosts`/
/// `lpm.port` defaults).
enum MacStore {
    static let recordsKey = "lpm.macs"
    static let activeKey = "lpm.activeMacId"

    // Legacy (pre multi-Mac) flat endpoint keys, read once by the migration.
    private static let legacyHostsKey = "lpm.hosts"
    private static let legacyHostKey = "lpm.host"
    private static let legacyPortKey = "lpm.port"

    static let defaultPort: UInt16 = 8765

    static func loadRecords() -> [MacRecord] {
        guard let data = UserDefaults.standard.data(forKey: recordsKey),
              let records = try? JSONDecoder().decode([MacRecord].self, from: data) else {
            return []
        }
        return records
    }

    static func saveRecords(_ records: [MacRecord]) {
        guard let data = try? JSONEncoder().encode(records) else { return }
        UserDefaults.standard.set(data, forKey: recordsKey)
    }

    static func loadActiveId() -> UUID? {
        guard let s = UserDefaults.standard.string(forKey: activeKey) else { return nil }
        return UUID(uuidString: s)
    }

    static func saveActiveId(_ id: UUID?) {
        let d = UserDefaults.standard
        if let id { d.set(id.uuidString, forKey: activeKey) } else { d.removeObject(forKey: activeKey) }
    }

    /// Move a legacy single-Mac pairing into a `MacRecord`, idempotently. Runs at
    /// startup; a no-op once `lpm.macs` exists. Only an actually-paired device (a
    /// legacy Keychain credential present) becomes a record — a stray host with no
    /// credential is just cleared, leaving the phone at the pairing screen.
    ///
    /// Ordering is crash-safe: the new state (per-Mac Keychain credential, then the
    /// records array + active id) is written *before* the legacy keys are cleared.
    /// An interruption before the clear leaves the migrated state in place and the
    /// legacy keys harmless (they're never read once `lpm.macs` is non-empty), so a
    /// re-run sees records and skips — the user is never stranded unpaired.
    static func migrateLegacyIfNeeded() {
        guard loadRecords().isEmpty else { return }

        guard let cred = Keychain.loadLegacy() else {
            clearLegacyKeys()
            return
        }

        let hosts = legacyHosts()
        let record = MacRecord(
            localId: UUID(),
            serverId: nil,
            name: hosts.first ?? "My Mac",
            hosts: hosts,
            port: legacyPort()
        )
        Keychain.save(deviceId: cred.deviceId, token: cred.token, for: record.localId)
        saveRecords([record])
        saveActiveId(record.localId)

        Keychain.clearLegacy()
        clearLegacyKeys()
    }

    private static func legacyHosts() -> [String] {
        let d = UserDefaults.standard
        if let data = d.data(forKey: legacyHostsKey),
           let arr = try? JSONDecoder().decode([String].self, from: data), !arr.isEmpty {
            return arr
        }
        if let h = d.string(forKey: legacyHostKey) { return [h] }
        return ["127.0.0.1"]
    }

    private static func legacyPort() -> UInt16 {
        let p = UserDefaults.standard.integer(forKey: legacyPortKey)
        return p > 0 ? UInt16(clamping: p) : defaultPort
    }

    private static func clearLegacyKeys() {
        let d = UserDefaults.standard
        d.removeObject(forKey: legacyHostsKey)
        d.removeObject(forKey: legacyHostKey)
        d.removeObject(forKey: legacyPortKey)
    }
}
