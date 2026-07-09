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
    // A failed duplicate/remove message to show once (e.g. "cannot duplicate an
    // SSH project"). The list itself refreshes off the projects-changed push.
    @Published var actionError: String?
    // The duplicate modal's initial toggle state, mirrored from the desktop's
    // persisted settings so the phone's modal opens with matching defaults.
    @Published var duplicateDefaults = DuplicateOptions()
    // Live progress of an in-flight duplicate batch (nil when idle).
    @Published var duplicateProgress: DuplicateProgress?
    // A non-fatal notice to show once (e.g. copies made but a run task needs the
    // Mac app open). Distinct from actionError, which is a hard failure.
    @Published var notice: String?
    // project -> desired running state while a Start/Stop is in flight, so the UI
    // can spin until the projects push confirms it (or a timeout gives up).
    @Published var pendingRun: [String: Bool] = [:]
    // Projects with a new-terminal/run-action in flight: the desktop creates the
    // terminal asynchronously, so show a placeholder row until it appears.
    @Published var creatingTerminals: Set<String> = []
    // Terminal ids present when the create was requested; a response containing
    // an id outside this set means the new terminal has landed.
    private var creatingBaseline: [String: Set<String>] = [:]
    private var creatingGen: [String: Int] = [:]

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
        actionError = nil
        pendingRun = [:]
        creatingTerminals = []
        creatingBaseline = [:]
        creatingGen = [:]
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

    func startProject(_ p: Project, profile: String = "") {
        markRunPending(p.name, desired: true)
        client?.startProject(p.name, profile: profile)
    }
    func stopProject(_ p: Project) {
        markRunPending(p.name, desired: false)
        client?.stopProject(p.name)
    }
    /// Show the in-flight spinner until the projects push confirms the desired
    /// state; give up after a timeout so a lost request can't spin forever.
    private func markRunPending(_ name: String, desired: Bool) {
        pendingRun[name] = desired
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            if self?.pendingRun[name] == desired { self?.pendingRun[name] = nil }
        }
    }
    /// Clone a project (folder + config) with the chosen duplicate options. Each
    /// new copy streams in via the projects-changed push; a failure surfaces in
    /// actionError.
    func duplicateProject(_ p: Project, options: DuplicateOptions) {
        duplicateProgress = DuplicateProgress(source: p.label, done: 0, total: options.count)
        client?.duplicateProject(p.name, options: options)
    }
    /// Remove a project — offered only for duplicates, whose folder is deleted from
    /// disk. The list refreshes off the projects-changed push.
    func removeProject(_ p: Project) { client?.removeProject(p.name) }
    func toggleService(_ project: String, service: String) { client?.toggleService(project, service: service) }
    func loadTerminals(_ project: String) { client?.requestTerminals(project: project) }

    /// Pull-to-refresh on the projects list: re-request projects + sidebar when
    /// live, or kick a reconnect when the link is down. The brief wait lets the
    /// round-trip land so the refresh control reflects a real update.
    func refreshProjects() async {
        if case .ready = connection {
            client?.requestProjects()
            client?.requestSidebar()
        } else {
            reconnectIfNeeded()
        }
        try? await Task.sleep(nanoseconds: 500_000_000)
    }

    func runAction(_ project: String, action: String) {
        client?.runAction(project: project, action: action)
        markTerminalCreating(project)
        reloadTerminalsSoon(project)
    }
    func newTerminal(_ project: String) {
        client?.newTerminal(project: project)
        markTerminalCreating(project)
        reloadTerminalsSoon(project)
    }
    /// Show a placeholder terminal row until a terminals response contains an id
    /// that wasn't there at request time, or a timeout gives up (e.g. a run task
    /// that needs the Mac app open never spawned one). The give-up refreshes the
    /// list one last time so the screen converges to the Mac's truth instead of
    /// going stale-empty.
    private func markTerminalCreating(_ project: String) {
        creatingBaseline[project] = Set(terminals[project]?.map(\.id) ?? [])
        creatingTerminals.insert(project)
        let gen = (creatingGen[project] ?? 0) + 1
        creatingGen[project] = gen
        DispatchQueue.main.asyncAfter(deadline: .now() + 14) { [weak self] in
            guard let self, self.creatingGen[project] == gen else { return }
            self.creatingTerminals.remove(project)
            self.creatingBaseline[project] = nil
            self.loadTerminals(project)
        }
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
    /// waits for the shell prompt to settle, which can take several seconds), so
    /// poll the list until the new terminal shows up.
    private func reloadTerminalsSoon(_ project: String) {
        for delay in [0.6, 1.5, 3.0, 5.0, 8.0, 12.0] {
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

    /// The projects list arranged exactly like the desktop sidebar (a port of
    /// Sidebar.tsx's tree build): walk `sidebarOrder`, emitting each folder with
    /// its members and each loose (non-duplicate, non-member) project, with every
    /// duplicate nested immediately after its parent. Folders/loose projects
    /// missing from the order are appended so nothing vanishes. A duplicate whose
    /// parent is gone counts as top-level (mirrors the desktop's `isDuplicate`).
    var sidebarItems: [SidebarItem] {
        let byName = Dictionary(projects.map { ($0.name, $0) }, uniquingKeysWith: { a, _ in a })
        // project name -> folder id
        var membership: [String: String] = [:]
        for g in groups { for m in g.members { membership[m] = g.id } }

        // A duplicate only when its parent is still present — an orphan is loose.
        func isDup(_ p: Project) -> Bool { !p.parentName.isEmpty && byName[p.parentName] != nil }

        // Duplicates not explicitly placed in a folder nest under their parent,
        // in project-list order (which the server already sorts by projectOrder).
        var childrenByParent: [String: [Project]] = [:]
        for p in projects where isDup(p) && membership[p.name] == nil {
            childrenByParent[p.parentName, default: []].append(p)
        }
        let groupsById = Dictionary(groups.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })

        var out: [SidebarItem] = []
        var rendered = Set<String>()

        // A project plus its nested duplicate children, each flagged for indent.
        func rows(for p: Project) -> [SidebarRow] {
            rendered.insert(p.name)
            var r = [SidebarRow(project: p, isChild: false)]
            for child in childrenByParent[p.name] ?? [] {
                rendered.insert(child.name)
                r.append(SidebarRow(project: child, isChild: true))
            }
            return r
        }

        var seenGroups = Set<String>()
        func emitGroup(_ g: ProjectFolder) {
            seenGroups.insert(g.id)
            let memberRows = g.members.compactMap { byName[$0] }.flatMap { rows(for: $0) }
            out.append(.folder(g, memberRows))
        }

        for token in sidebarOrder {
            if token.hasPrefix("group:") {
                let gid = String(token.dropFirst("group:".count))
                if let g = groupsById[gid], !seenGroups.contains(gid) { emitGroup(g) }
            } else if let p = byName[token], !rendered.contains(token),
                      !isDup(p), membership[token] == nil {
                out.append(contentsOf: rows(for: p).map(SidebarItem.project))
            }
        }
        // Folders missing from the order (defensive), then brand-new loose
        // projects not yet persisted into it — matching the desktop's tail passes.
        for g in groups where !seenGroups.contains(g.id) { emitGroup(g) }
        for p in projects where !rendered.contains(p.name) && !isDup(p) && membership[p.name] == nil {
            out.append(contentsOf: rows(for: p).map(SidebarItem.project))
        }
        return out
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
                c.requestDuplicateDefaults()
            }
        }
        c.onProjects = { [weak self] p in
            guard let self else { return }
            self.projects = p
            self.projectsLoaded = true
            for proj in p where self.pendingRun[proj.name] == proj.running {
                self.pendingRun[proj.name] = nil
            }
        }
        c.onSidebar = { [weak self] order, groups in
            self?.sidebarOrder = order
            self?.groups = groups
        }
        c.onTerminals = { [weak self] proj, t in
            guard let self else { return }
            self.terminals[proj] = t
            if let base = self.creatingBaseline[proj], t.contains(where: { !base.contains($0.id) }) {
                self.creatingBaseline[proj] = nil
                self.creatingTerminals.remove(proj)
            }
        }
        c.onSlash = { [weak self] id, cmds in self?.slashCommands[id] = cmds }
        c.onUpload = { [weak self] id, path in if !path.isEmpty { self?.pendingImagePath[id] = path } }
        c.onMentions = { [weak self] proj, entries in self?.mentions[proj] = entries }
        c.onHistory = { [weak self] proj, rows in self?.history[proj] = rows.filter { !$0.isDraft } }
        c.onProjectsChanged = {
            c.requestProjects()
            c.requestSidebar()
        }
        c.onStatusChanged = { proj in c.requestStatus(project: proj) }
        c.onActionError = { [weak self] message in self?.actionError = message }
        c.onDuplicateDefaults = { [weak self] excl, reinstall, pull in
            guard let self else { return }
            self.duplicateDefaults.excludeUncommitted = excl
            self.duplicateDefaults.reinstallDeps = reinstall
            self.duplicateDefaults.pullLatest = pull
        }
        c.onDuplicateProgress = { [weak self] done, total, name in
            guard let self else { return }
            if var p = self.duplicateProgress {
                p.done = done
                p.total = total
                self.duplicateProgress = p
            } else {
                self.duplicateProgress = DuplicateProgress(source: name, done: done, total: total)
            }
        }
        c.onDuplicateDone = { [weak self] error, warning in
            guard let self else { return }
            self.duplicateProgress = nil
            if let error {
                self.actionError = error
            } else if let warning {
                self.notice = warning
            }
        }
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

/// A rendered project row: the project plus whether it's a nested duplicate,
/// which the list indents under its parent — mirroring the desktop's `isChild`.
struct SidebarRow: Identifiable {
    let project: Project
    let isChild: Bool
    var id: String { project.name }
}

/// One row of the projects screen: a top-level project (possibly a nested
/// duplicate) or a folder + its members (each member carries its own indent flag).
enum SidebarItem: Identifiable {
    case project(SidebarRow)
    case folder(ProjectFolder, [SidebarRow])

    var id: String {
        switch self {
        case .project(let r): return "p:" + r.project.name
        case .folder(let g, _): return "g:" + g.id
        }
    }
}

private extension Int {
    var nonzero: Int? { self == 0 ? nil : self }
}
