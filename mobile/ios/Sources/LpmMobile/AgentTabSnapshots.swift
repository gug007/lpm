import Foundation

/// Each Mac's agent tabs as this phone last had them: the tab lists and each tab's
/// last screen, so a project opens on something to read while the Mac is away. In
/// Caches, which backups leave out, and gone with the Mac when it's unpaired.
@MainActor
final class AgentTabSnapshots {
    struct Screen: Codable, Equatable {
        /// The escape codes that draw the screen again.
        var text: String
        var at: Date
    }

    /// A project's `terminals` frame, and the agent tabs it lists.
    private final class Listed {
        let frame: String
        private(set) lazy var tabs: [TerminalInfo] = {
            guard case .terminals(_, let tabs) = Wire.Inbound.parse(frame) else { return [] }
            return Self.agentTabs(tabs)
        }()

        init(_ frame: String) { self.frame = frame }

        init(_ frame: String, _ tabs: [TerminalInfo]) {
            self.frame = frame
            self.tabs = Self.agentTabs(tabs)
        }

        private static func agentTabs(_ tabs: [TerminalInfo]) -> [TerminalInfo] { tabs.filter { !$0.cli.isEmpty } }
    }

    private var lists: [UUID: [String: Listed]] = [:]
    private var dirty: Set<UUID> = []
    private var flush: DispatchWorkItem?
    // One file operation at a time, in the order asked for: a removal isn't undone by a
    // write that was already on its way.
    private let disk = DispatchQueue(label: "cx.lpm.agent-tabs", qos: .utility)

    /// Keep a project's list, sent as `frame`, and drop the screens of tabs it no longer has.
    func record(_ project: String, _ tabs: [TerminalInfo], frame: String, for mac: UUID) {
        let known = entries(mac)[project]
        guard !project.isEmpty, known?.frame != frame else { return }
        let left = Set(tabs.map(\.id))
        let gone = (known?.tabs ?? []).filter { !left.contains($0.id) }
        lists[mac]?[project] = Listed(frame, tabs)
        save(mac)
        deleteScreens(of: gone, for: mac)
    }

    /// Forget projects the Mac no longer has.
    func keep(_ projects: Set<String>, for mac: UUID) {
        let gone = entries(mac).filter { !projects.contains($0.key) }
        guard !gone.isEmpty else { return }
        for project in gone.keys { lists[mac]?[project] = nil }
        save(mac)
        deleteScreens(of: gone.values.flatMap(\.tabs), for: mac)
    }

    /// The project's agent tabs, as the Mac last listed them.
    func tabs(_ project: String, for mac: UUID) -> [TerminalInfo] { entries(mac)[project]?.tabs ?? [] }

    func saveScreen(_ text: String, at: Date, terminal: String, for mac: UUID) {
        let file = Self.screenURL(mac, terminal)
        disk.async { Self.write(Screen(text: text, at: at), to: file) }
    }

    func screen(_ terminal: String, for mac: UUID) async -> Screen? {
        let file = Self.screenURL(mac, terminal)
        return await onDisk { Self.read(Screen.self, from: file) }
    }

    /// Those of these terminals a screen is kept of.
    func withScreens(_ terminals: [String], for mac: UUID) async -> Set<String> {
        let files = terminals.map { ($0, Self.screenURL(mac, $0)) }
        return await onDisk {
            Set(files.filter { FileManager.default.fileExists(atPath: $0.1.path) }.map(\.0))
        }
    }

    func remove(_ mac: UUID) {
        lists[mac] = [:]
        dirty.remove(mac)
        let dir = Self.dir(mac)
        disk.async { try? FileManager.default.removeItem(at: dir) }
    }

    private func entries(_ mac: UUID) -> [String: Listed] {
        if let hit = lists[mac] { return hit }
        let read = (Self.read([String: String].self, from: Self.listURL(mac)) ?? [:]).mapValues { Listed($0) }
        lists[mac] = read
        return read
    }

    private func save(_ mac: UUID) {
        dirty.insert(mac)
        flush?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            let batch = self.dirty.compactMap { id in
                self.lists[id].map { (Self.listURL(id), $0.mapValues(\.frame)) }
            }
            self.dirty = []
            self.disk.async {
                for (file, frames) in batch { Self.write(frames, to: file) }
            }
        }
        flush = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2, execute: work)
    }

    private func deleteScreens(of tabs: [TerminalInfo], for mac: UUID) {
        guard !tabs.isEmpty else { return }
        let files = tabs.map { Self.screenURL(mac, $0.id) }
        disk.async { for file in files { try? FileManager.default.removeItem(at: file) } }
    }

    private func onDisk<T>(_ work: @escaping () -> T) async -> T {
        await withCheckedContinuation { done in
            disk.async { done.resume(returning: work()) }
        }
    }

    private nonisolated static func write<T: Encodable>(_ value: T, to file: URL) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: .atomic)
    }

    private nonisolated static func read<T: Decodable>(_ type: T.Type, from file: URL) -> T? {
        (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(type, from: $0) }
    }

    private nonisolated static func dir(_ mac: UUID) -> URL {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("agent-tabs", isDirectory: true)
            .appendingPathComponent(mac.uuidString, isDirectory: true)
    }

    private nonisolated static func listURL(_ mac: UUID) -> URL {
        dir(mac).appendingPathComponent("tabs.json")
    }

    private nonisolated static func screenURL(_ mac: UUID, _ terminal: String) -> URL {
        dir(mac).appendingPathComponent(CertPinning.sha256Hex(Data(terminal.utf8)) + ".json")
    }
}
