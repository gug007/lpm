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
    // terminal id -> current owner. Absent = nobody/unknown (this phone may show
    // it). A terminal is rendered live in exactly one surface; when the desktop
    // (or another phone) owns it, this phone shows a "take control" placeholder.
    @Published var controlOwner: [String: ControlOwner] = [:]

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
    func resize(_ id: String, cols: Int, rows: Int) {
        // Only the owner drives the single shared PTY size; a non-owning phone
        // must not fight the desktop over it (Rust drops it anyway, but don't
        // even send).
        guard isControlled(id) else { return }
        client?.resize(id, cols: cols, rows: rows)
    }

    /// Whether this phone renders the terminal live (vs. the "take control"
    /// placeholder): true when it owns the terminal, or while ownership is unknown
    /// / unclaimed (so a terminal only this phone shows never flips to a placeholder).
    func isControlled(_ id: String) -> Bool {
        guard let o = controlOwner[id] else { return true }
        return o.kind == "mobile" && o.id == client?.deviceId
    }

    /// The owner's friendly name, for the placeholder ("Active on <name>").
    func controlOwnerLabel(_ id: String) -> String {
        controlOwner[id]?.label ?? "another device"
    }

    /// Take control here (the "Take control" button): this phone becomes the owner
    /// and the previous owner flips to its own placeholder.
    func claimControl(_ id: String) { client?.claim(id) }

    private func setControlOwner(_ id: String, _ owner: ControlOwner?) {
        if let owner { controlOwner[id] = owner } else { controlOwner[id] = nil }
    }
    /// Send a composed message: the web view wraps it as a bracketed paste (when
    /// the running program enabled that) and appends a CR to submit.
    func submit(_ id: String, _ text: String) { terminalSubmit[id]?(text) }

    func startProject(_ p: Project, profile: String = "") { client?.startProject(p.name, profile: profile) }
    func stopProject(_ p: Project) { client?.stopProject(p.name) }
    func toggleService(_ project: String, service: String) { client?.toggleService(project, service: service) }
    func loadTerminals(_ project: String) { client?.requestTerminals(project: project) }

    func runAction(_ project: String, action: String) {
        client?.runAction(project: project, action: action)
        reloadTerminalsSoon(project)
    }
    func newTerminal(_ project: String) {
        client?.newTerminal(project: project)
        reloadTerminalsSoon(project)
    }
    func closeTerminal(_ project: String, id: String) {
        client?.closeTerminal(project: project, id: id)
        reloadTerminalsSoon(project)
    }
    func renameTerminal(_ project: String, id: String, label: String) {
        client?.renameTerminal(project: project, id: id, label: label)
        reloadTerminalsSoon(project)
    }
    func pinTerminal(_ project: String, id: String) {
        client?.pinTerminal(project: project, id: id)
        reloadTerminalsSoon(project)
    }
    /// The desktop creates the terminal + types its command asynchronously (it
    /// waits for the shell prompt to settle), so poll the list a few times for the
    /// new terminal to show up.
    private func reloadTerminalsSoon(_ project: String) {
        for delay in [0.6, 1.5, 3.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.loadTerminals(project)
            }
        }
    }
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
                // Copy with fresh status — preserves services/actions.
                self.projects[idx] = self.projects[idx].withStatus(entries)
            }
        }
        c.onSeed = { [weak self] id, cols, rows, data in self?.onTerminalSeed[id]?(cols, rows, data) }
        c.onOutput = { [weak self] id, data in self?.onTerminalOutput[id]?(data) }
        c.onControl = { [weak self] id, owner in self?.setControlOwner(id, owner) }
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
