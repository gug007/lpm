import Foundation

/// The last project list each Mac sent, kept on disk so the app opens on
/// something to read even when the Mac can't be reached, marked with when it was
/// last current. Stores the frames exactly as they arrived and reads them back
/// through the normal parser, so the saved list can never drift from the live one.
@MainActor
final class ProjectSnapshots {
    struct Snapshot {
        var projects: [Project] = []
        var workStatuses: [CustomWorkStatus] = defaultWorkStatusPalette
        var workStatusOrder: [String] = []
        var sidebarOrder: [String] = []
        var groups: [ProjectFolder] = []
        var at: Date
    }

    private struct Stored: Codable {
        var projects: String?
        var sidebar: String?
        var at: Date
    }

    private var cache: [UUID: Stored] = [:]
    private var dirty: Set<UUID> = []
    private var flush: DispatchWorkItem?
    private let disk = DispatchQueue(label: "cx.lpm.project-lists", qos: .utility)

    /// Keep a `projects` or `sidebar` frame for `mac`, written out shortly after
    /// the last one in a burst.
    func record(_ text: String, for mac: UUID) {
        var entry = self.entry(mac) ?? Stored(at: Date())
        if text.contains("\"t\":\"sidebar\"") { entry.sidebar = text } else { entry.projects = text }
        entry.at = Date()
        save(entry, for: mac)
    }

    /// Stamp the saved list as current up to `at`, the last time the link was live.
    func touch(_ mac: UUID, at: Date) {
        guard var entry = self.entry(mac) else { return }
        entry.at = at
        save(entry, for: mac)
    }

    func load(_ mac: UUID) -> Snapshot? {
        guard let entry = self.entry(mac), let projectsText = entry.projects,
              case .projects(let projects, let statuses, let order) = Wire.Inbound.parse(projectsText) else {
            return nil
        }
        var snapshot = Snapshot(projects: projects, workStatuses: statuses, workStatusOrder: order, at: entry.at)
        if let sidebar = entry.sidebar, case .sidebar(let order, let groups) = Wire.Inbound.parse(sidebar) {
            snapshot.sidebarOrder = order
            snapshot.groups = groups
        }
        return snapshot
    }

    func remove(_ mac: UUID) {
        cache[mac] = nil
        dirty.remove(mac)
        disk.async { try? FileManager.default.removeItem(at: Self.url(mac)) }
    }

    private func entry(_ mac: UUID) -> Stored? {
        if let hit = cache[mac] { return hit }
        let read = Self.read(mac)
        cache[mac] = read
        return read
    }

    private func save(_ entry: Stored, for mac: UUID) {
        cache[mac] = entry
        dirty.insert(mac)
        flush?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            let batch = self.dirty.compactMap { id in self.cache[id].map { (id, $0) } }
            self.dirty = []
            self.disk.async {
                for (mac, stored) in batch { Self.write(stored, for: mac) }
            }
        }
        flush = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    private nonisolated static func url(_ mac: UUID) -> URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("project-lists", isDirectory: true)
            .appendingPathComponent(mac.uuidString + ".json")
    }

    private nonisolated static func read(_ mac: UUID) -> Stored? {
        guard let data = try? Data(contentsOf: url(mac)) else { return nil }
        return try? JSONDecoder().decode(Stored.self, from: data)
    }

    private nonisolated static func write(_ stored: Stored, for mac: UUID) {
        let target = url(mac)
        try? FileManager.default.createDirectory(at: target.deletingLastPathComponent(),
                                                 withIntermediateDirectories: true)
        guard let data = try? JSONEncoder().encode(stored) else { return }
        try? data.write(to: target, options: .atomic)
    }
}
