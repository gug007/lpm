import Foundation
import SwiftUI
import UIKit

/// Top-level observable state: the connection, the project list, and per-project
/// status. Views observe this; the client drives it.
@MainActor
final class AppModel: ObservableObject {
    @Published var connection: LpmClient.State = .idle
    @Published var projects: [Project] = []
    // False until the first projects list arrives, so the UI can tell an empty
    // list apart from "still loading" and show a spinner instead of "No projects".
    @Published var projectsLoaded = false
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
    // The addresses the current attempt is racing, so a failure can name exactly
    // what it tried (LAN vs Tailscale) instead of a generic "can't reach".
    private var attemptHosts: [String] = []
    // Guards the opportunistic host migration in onState against overlapping
    // re-probes while one is already in flight.
    private var repicking = false
    // The host the live client was built for, so migration only rebuilds when a
    // *different* address becomes reachable.
    private var currentHost: String?

    func bootstrap() {
        guard let cred = Keychain.load() else { paired = false; return }
        paired = true
        connectBest(credential: cred)
    }

    /// Probe the remembered addresses and connect to whichever the phone can
    /// reach right now — the LAN IP at home, the Tailscale IP away from home.
    private func connectBest(credential: LpmClient.Credential) {
        let hosts = savedHosts()
        let port = savedPort()
        attemptHosts = hosts
        connection = .connecting
        Task { @MainActor in
            var winner = await HostProbe.firstReachable(hosts, port: port)
            if winner == nil {
                // On foreground the Tailscale on-demand tunnel may not be up yet;
                // give it a moment and probe once more before falling back.
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                winner = await HostProbe.firstReachable(hosts, port: port)
            }
            // When nothing answers, prefer the Tailscale (CGNAT) address over the
            // LAN IP — the LAN IP is unroutable on cellular, so retrying it spins.
            let host = winner ?? Self.cgnatHost(hosts) ?? hosts.first ?? "127.0.0.1"
            connect(host: host, port: port, credential: credential)
        }
    }

    /// A Tailscale CGNAT address (100.64.0.0/10) from the candidates, if any:
    /// an IPv4 whose first octet is 100 and second is in 64...127.
    private static func cgnatHost(_ hosts: [String]) -> String? {
        hosts.first { host in
            let octets = host.split(separator: ".").compactMap { Int($0) }
            return octets.count == 4 && octets[0] == 100 && (64...127).contains(octets[1])
        }
    }

    /// A live client only ever retries the one host it was built with, so a phone
    /// that roams (LAN → cellular) keeps hammering an address that's now
    /// unroutable. Once its retries stop being patient — the client surfaces
    /// `offlineHint` — re-probe the saved hosts and, if a *different* one is now
    /// reachable, migrate the live connection to it. Otherwise do nothing: the
    /// failed state (and Retry button) stays visible, and the client re-emits
    /// `offlineHint` on each slow retry (~20s), so this re-probes periodically
    /// with no timer.
    private func repickHostIfStale(_ s: LpmClient.State, from c: LpmClient) {
        guard case .failed(LpmClient.offlineHint) = s,
              c === client, !repicking, let cred = Keychain.load() else { return }
        repicking = true
        Task { @MainActor in
            defer { repicking = false }
            let winner = await HostProbe.firstReachable(savedHosts(), port: savedPort())
            guard let winner, winner != currentHost, c === client else { return }
            connect(host: winner, port: savedPort(), credential: cred)
        }
    }

    func connect(host: String, port: Int, credential: LpmClient.Credential) {
        client?.disconnect()
        currentHost = host
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: credential,
                          deviceName: UIDevice.current.name)
        wire(c)
        client = c
        c.connect()
    }

    func pair(hosts: [String], port: Int, code: String) {
        persistHosts(hosts)
        UserDefaults.standard.set(port, forKey: "lpm.port")
        attemptHosts = hosts
        connection = .connecting
        Task { @MainActor in
            // The probe uses the real WebSocket transport, so if none respond the
            // live connection wouldn't either — fail fast and report each host's
            // reason rather than spin on a generic hint for the whole timeout.
            let (winner, outcomes) = await HostProbe.race(hosts, port: port)
            guard let host = winner else {
                connection = .failed(probeDiagnostic(outcomes, hosts: hosts))
                return
            }
            client?.disconnect()
            currentHost = host
            let c = LpmClient(endpoint: .init(host: host, port: port),
                              credential: nil, deviceName: UIDevice.current.name)
            wire(c)
            client = c
            c.pair(host: host, port: port, code: code)
        }
    }

    func reconnectIfNeeded() {
        if case .ready = connection { return }
        // Reuse the live client when we have one — it re-auths and re-subscribes
        // to the terminals this phone was watching. Only rebuild (and re-probe
        // for a reachable address) on a cold start with no client.
        if let client {
            client.connect()
        } else if let cred = Keychain.load() {
            connectBest(credential: cred)
        }
    }

    /// The "Retry" button: force an immediate attempt now, skipping any backoff.
    /// Re-probes for a reachable address if we don't have a live client yet.
    func retryConnection() {
        if let client {
            client.retryNow()
        } else if let cred = Keychain.load() {
            connectBest(credential: cred)
        }
    }

    private func savedHosts() -> [String] {
        if let data = UserDefaults.standard.data(forKey: "lpm.hosts"),
           let arr = try? JSONDecoder().decode([String].self, from: data), !arr.isEmpty {
            return arr
        }
        if let h = UserDefaults.standard.string(forKey: "lpm.host") { return [h] }
        return ["127.0.0.1"]
    }

    private func persistHosts(_ hosts: [String]) {
        if let data = try? JSONEncoder().encode(hosts) {
            UserDefaults.standard.set(data, forKey: "lpm.hosts")
        }
        if let first = hosts.first { UserDefaults.standard.set(first, forKey: "lpm.host") }
    }

    private func savedPort() -> Int {
        UserDefaults.standard.integer(forKey: "lpm.port").nonzero ?? 8765
    }

    /// Forget this device's pairing: drop the live connection, wipe the Keychain
    /// credential and remembered endpoint, and clear all cached state so the next
    /// device to pair here starts clean. Returns the UI to the pairing screen.
    func logout() {
        client?.disconnect()
        client = nil
        currentHost = nil
        Keychain.clear()
        UserDefaults.standard.removeObject(forKey: "lpm.host")
        UserDefaults.standard.removeObject(forKey: "lpm.hosts")
        UserDefaults.standard.removeObject(forKey: "lpm.port")

        connection = .idle
        projects = []
        projectsLoaded = false
        terminals = [:]
        slashCommands = [:]
        pendingImagePath = [:]
        mentions = [:]
        history = [:]
        sidebarOrder = []
        groups = []
        controlOwner = [:]
        paired = false
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
    /// Reorder a project's terminal tabs. Applies the new order optimistically so
    /// the list doesn't snap back before the desktop echoes it via the terminals
    /// push (which is now emitted in tab-tree order).
    func reorderTerminals(_ project: String, order: [String]) {
        if let list = terminals[project] {
            let byId = Dictionary(list.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            let reordered = order.compactMap { byId[$0] }
            if reordered.count == list.count { terminals[project] = reordered }
        }
        client?.reorderTerminals(project: project, order: order)
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

    /// Turn a raw client failure into something the pairing screen can act on:
    /// the generic offline hint becomes the exact addresses tried (LAN vs
    /// Tailscale), and a server-side code rejection reads as a code problem — so
    /// "wrong network" and "bad/expired code" never look the same.
    private func userFacing(_ s: LpmClient.State) -> LpmClient.State {
        guard case .failed(let msg) = s else { return s }
        if msg == LpmClient.offlineHint { return .failed(unreachableMessage(attemptHosts)) }
        if msg == "pairing rejected" {
            return .failed("Pairing code rejected. On your Mac, tap Add device for a fresh code, then scan again.")
        }
        return s
    }

    private func unreachableMessage(_ hosts: [String]) -> String {
        let list = hosts.filter { !$0.isEmpty }.joined(separator: ", ")
        let target = list.isEmpty ? "your Mac" : "your Mac at \(list)"
        return "Couldn't reach \(target) — none of its addresses responded. On cellular, open the Tailscale app and make sure it's connected on both devices."
    }

    /// Per-host probe reasons for the pairing screen — e.g. "192.168.0.80: timed
    /// out · 100.92.155.108: refused" — so LAN-blocked vs Tailscale-down is
    /// obvious without another debugging round-trip.
    private func probeDiagnostic(_ outcomes: [HostProbe.Outcome], hosts: [String]) -> String {
        let detail = outcomes.isEmpty
            ? hosts.filter { !$0.isEmpty }.joined(separator: ", ")
            : outcomes.map { "\($0.host): \($0.detail)" }.joined(separator: " · ")
        return "Couldn't reach your Mac — \(detail). On cellular, open the Tailscale app and confirm it's connected on both devices."
    }

    private func wire(_ c: LpmClient) {
        c.onState = { [weak self] s in
            guard let self else { return }
            self.connection = self.userFacing(s)
            self.repickHostIfStale(s, from: c)
            if case .ready = s {
                self.paired = true
                c.requestProjects()
                c.requestSidebar()
            }
        }
        c.onProjects = { [weak self] p in
            self?.projects = p
            self?.projectsLoaded = true
        }
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
