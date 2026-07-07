import Foundation
import SwiftUI
import UIKit

/// Top-level observable state: the connection, the project list, and per-project
/// status. Views observe this; the client drives it.
@MainActor
final class AppModel: ObservableObject {
    @Published var connection: LpmClient.State = .idle
    @Published var projects: [Project] = []
    @Published var terminals: [String: [TerminalInfo]] = [:] // project -> terminals
    @Published var slashCommands: [String: [SlashCommand]] = [:] // terminal id -> commands
    // One-shot: a just-uploaded image's on-Mac path, for the composer to insert.
    @Published var pendingImagePath: [String: String] = [:] // terminal id -> path
    @Published var mentions: [String: [MentionEntry]] = [:] // project -> @-mention targets
    @Published var history: [String: [HistoryRow]] = [:] // project -> recent sent prompts
    @Published var paired: Bool = false
    // Sidebar folders, matching the desktop: `order` interleaves project names and
    // "group:<id>" tokens; `groups` are the folder defs.
    @Published var sidebarOrder: [String] = []
    @Published var groups: [ProjectFolder] = []

    // Terminal streams go straight to whichever TerminalScreen is subscribed; the
    // emulator (SwiftTerm) holds the buffer, not this model. Seed and live output
    // are kept separate so the view can reset the emulator before replaying the
    // seed (raw scrollback) — otherwise a TUI's cursor-positioned redraws overlap.
    var onTerminalSeed: [String: (_ cols: Int, _ rows: Int, _ data: String) -> Void] = [:]
    var onTerminalOutput: [String: (String) -> Void] = [:]
    // Composer "send": routed into the terminal's web view so it can apply the
    // same bracketed-paste wrapping the desktop does (which needs xterm's live
    // bracketed-paste mode). Registered by WebTerminalView.
    var terminalSubmit: [String: (String) -> Void] = [:]

    private var client: LpmClient?

    func bootstrap() {
        guard let cred = Keychain.load() else { paired = false; return }
        paired = true
        // Endpoint is remembered from the last successful connect (persist it in
        // UserDefaults in a real build); default to loopback for the simulator.
        connect(host: UserDefaults.standard.string(forKey: "lpm.host") ?? "127.0.0.1",
                port: UserDefaults.standard.integer(forKey: "lpm.port").nonzero ?? 8765,
                credential: cred)
    }

    func connect(host: String, port: Int, credential: LpmClient.Credential) {
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: credential,
                          deviceName: UIDevice.current.name)
        wire(c)
        client = c
        c.connect()
    }

    func pair(host: String, port: Int, code: String) {
        UserDefaults.standard.set(host, forKey: "lpm.host")
        UserDefaults.standard.set(port, forKey: "lpm.port")
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: nil, deviceName: UIDevice.current.name)
        wire(c)
        client = c
        c.pair(host: host, port: port, code: code)
    }

    func reconnectIfNeeded() {
        if case .ready = connection { return }
        client?.connect()
    }

    // Terminal wiring used by TerminalScreen.
    func subscribe(
        _ id: String,
        onSeed: @escaping (_ cols: Int, _ rows: Int, _ data: String) -> Void,
        onOutput: @escaping (String) -> Void
    ) {
        onTerminalSeed[id] = onSeed
        onTerminalOutput[id] = onOutput
        client?.subscribe(id)
    }
    func unsubscribe(_ id: String) {
        onTerminalSeed[id] = nil
        onTerminalOutput[id] = nil
        client?.unsubscribe(id)
    }
    func input(_ id: String, _ data: String) { client?.sendInput(id, data) }
    func resize(_ id: String, cols: Int, rows: Int) { client?.resize(id, cols: cols, rows: rows) }
    /// Send a composed message: the web view wraps it as a bracketed paste (when
    /// the running program enabled that) and appends a CR to submit.
    func submit(_ id: String, _ text: String) { terminalSubmit[id]?(text) }

    func startProject(_ p: Project) { client?.startProject(p.name) }
    func stopProject(_ p: Project) { client?.stopProject(p.name) }
    func loadTerminals(_ project: String) { client?.requestTerminals(project: project) }
    func loadSlash(_ id: String, project: String) { client?.requestSlash(id: id, project: project) }
    func uploadImage(_ id: String, _ b64: String, mime: String) { client?.uploadImage(id, b64, mime: mime) }
    func loadMentions(_ project: String) { client?.requestMentions(project: project) }
    func loadHistory(_ project: String, q: String = "") { client?.requestHistory(project: project, q: q) }
    func recordHistory(project: String, id: String, label: String, text: String) {
        client?.recordHistory(project: project, id: id, label: label, text: text)
    }

    /// The projects list arranged like the desktop sidebar: folders (with their
    /// members) and top-level projects, in `sidebarOrder`. Falls back to a flat
    /// list before the layout has loaded, and appends any project the order
    /// doesn't mention so nothing silently disappears.
    var sidebarItems: [SidebarItem] {
        let byName = Dictionary(projects.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        guard !sidebarOrder.isEmpty else { return projects.map { .project($0) } }

        var items: [SidebarItem] = []
        var covered = Set<String>()
        for token in sidebarOrder {
            if token.hasPrefix("group:") {
                let gid = String(token.dropFirst("group:".count))
                guard let g = groups.first(where: { $0.id == gid }) else { continue }
                let members = g.members.compactMap { byName[$0] }
                members.forEach { covered.insert($0.name) }
                items.append(.folder(g, members))
            } else if let p = byName[token] {
                covered.insert(p.name)
                items.append(.project(p))
            }
        }
        for p in projects where !covered.contains(p.name) {
            items.append(.project(p))
        }
        return items
    }

    private func wire(_ c: LpmClient) {
        c.onState = { [weak self] s in
            self?.connection = s
            if case .ready = s {
                self?.paired = true
                c.requestProjects()
                c.requestSidebar()
            }
        }
        c.onProjects = { [weak self] p in self?.projects = p }
        c.onSidebar = { [weak self] order, groups in
            self?.sidebarOrder = order
            self?.groups = groups
        }
        c.onTerminals = { [weak self] proj, t in self?.terminals[proj] = t }
        c.onSlash = { [weak self] id, cmds in self?.slashCommands[id] = cmds }
        c.onUpload = { [weak self] id, path in if !path.isEmpty { self?.pendingImagePath[id] = path } }
        c.onMentions = { [weak self] proj, entries in self?.mentions[proj] = entries }
        c.onHistory = { [weak self] proj, rows in self?.history[proj] = rows.filter { !$0.isDraft } }
        c.onProjectsChanged = {
            c.requestProjects()
            c.requestSidebar()
        }
        c.onStatusChanged = { proj in c.requestStatus(project: proj) }
        c.onStatus = { [weak self] proj, entries in
            guard let self else { return }
            if let idx = self.projects.firstIndex(where: { $0.name == proj }) {
                // Rebuild the project with fresh status (Project is a value type).
                var dict = [String: Any]()
                dict["name"] = self.projects[idx].name
                dict["label"] = self.projects[idx].label
                dict["running"] = self.projects[idx].running
                dict["isRemote"] = self.projects[idx].isRemote
                dict["statusEntries"] = entries.map { ["key": $0.key, "value": $0.value, "priority": $0.priority, "timestamp": $0.timestamp] }
                self.projects[idx] = Project(dict)
            }
        }
        c.onSeed = { [weak self] id, cols, rows, data in self?.onTerminalSeed[id]?(cols, rows, data) }
        c.onOutput = { [weak self] id, data in self?.onTerminalOutput[id]?(data) }
    }
}

/// One row of the projects screen: a top-level project or a folder + its members.
enum SidebarItem: Identifiable {
    case project(Project)
    case folder(ProjectFolder, [Project])

    var id: String {
        switch self {
        case .project(let p): return "p:" + p.name
        case .folder(let g, _): return "g:" + g.id
        }
    }
}

private extension Int {
    var nonzero: Int? { self == 0 ? nil : self }
}
