import Foundation

/// What the share sheet offers: each paired Mac this phone reaches directly, with
/// where to reach it, its local projects and the agents a new tab can start. The
/// app writes it to the app group as it learns each Mac's projects; the share
/// extension only reads it. Nothing secret: credentials stay in the Keychain.
struct ShareDirectory: Codable, Equatable {
    struct Agent: Codable, Equatable, Hashable {
        let id: String
        let label: String
    }

    struct Project: Codable, Equatable, Hashable {
        let name: String
        let label: String

        var title: String { label.isEmpty ? name : label }
    }

    struct Mac: Codable, Equatable, Identifiable {
        /// The saved record's local id, which keys its Keychain items.
        let localId: String
        let serverId: String
        let name: String
        let hosts: [String]
        let port: Int
        let projects: [Project]
        /// Empty on a Mac that can't start agents from a phone.
        let agents: [Agent]

        var id: String { serverId }
    }

    var macs: [Mac] = []
    /// This install's id, sent in every first frame.
    var phoneId = ""

    private static let appGroup = "group.cx.lpm.mobile"

    private static var url: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("share-directory.json")
    }

    static func load() -> ShareDirectory {
        guard let url, let data = try? Data(contentsOf: url),
              let directory = try? JSONDecoder().decode(ShareDirectory.self, from: data) else { return ShareDirectory() }
        return directory
    }

    func save() {
        guard let url = Self.url, let data = try? JSONEncoder().encode(self) else { return }
        try? data.write(to: url, options: .atomic)
    }

    /// The directory with `mac` as it is now, the Macs no longer saved dropped.
    func updating(_ mac: Mac?, keeping serverIds: Set<String>, phoneId: String) -> ShareDirectory {
        var macs = self.macs.filter { serverIds.contains($0.serverId) && $0.serverId != mac?.serverId }
        if let mac { macs.insert(mac, at: 0) }
        return ShareDirectory(macs: macs, phoneId: phoneId)
    }

    /// The share sheet's last choices, so the next share starts where this one ended.
    enum Choice {
        private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

        static var mac: String? {
            get { defaults?.string(forKey: "share.mac") }
            set { defaults?.set(newValue, forKey: "share.mac") }
        }
        static var project: String? {
            get { defaults?.string(forKey: "share.project") }
            set { defaults?.set(newValue, forKey: "share.project") }
        }
        static var destination: String? {
            get { defaults?.string(forKey: "share.destination") }
            set { defaults?.set(newValue, forKey: "share.destination") }
        }
        static var agent: String? {
            get { defaults?.string(forKey: "share.agent") }
            set { defaults?.set(newValue, forKey: "share.agent") }
        }
    }
}
