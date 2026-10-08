import Foundation

/// One address's result from the last reachability check.
struct AddressCheck: Equatable {
    let reachable: Bool
    let detail: String
    let at: Date
}

/// Whether a saved machine other than the active one answers right now.
enum MacReach: Equatable { case checking, online, offline }

/// A Start, Stop or Run tapped while the Mac wasn't connected. It waits where
/// the user can see it, for at most `QueuedAction.lifetime`, then stops.
struct QueuedAction: Identifiable, Equatable {
    static let lifetime: TimeInterval = 120

    let id = UUID()
    let project: String
    let verb: String
    var queuedAt = Date()
    var expired = false
}

/// The "you're connected" check shown once a pairing lands.
struct PairedSummary: Identifiable, Equatable {
    let id = UUID()
    let macId: UUID
}

/// Why the pairing screen was opened for a Mac that's already saved.
enum RepairReason: Equatable { case notRecognized, identity, chosen }

/// A sign-in page for Built-in Tailscale, opened over the screen that asked.
struct TailscalePage: Identifiable, Equatable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Everything about the link to the active Mac that the connection UI shows:
/// the issue in plain words, the line under the Mac's name, address checks, the
/// queue of actions waiting for the Mac, and the sheets and flows around them.
/// The model feeds it; views read it as `model.link`.
@Observable @MainActor
final class LinkStore {
    @ObservationIgnored weak var model: AppModel?
    let network = NetworkWatcher()
    @ObservationIgnored let snapshots = ProjectSnapshots()

    /// The address the live connection (or the current attempt) dials.
    var host: String?
    /// The current client is pairing rather than reconnecting a saved Mac.
    var pairing = false
    var checks: [String: AddressCheck] = [:]
    var testing: Set<String> = []
    var probedAllFailed = false
    var connectedSince: Date?
    /// Still connecting after a couple of seconds — worth saying so.
    var slowConnect = false
    /// The last time the Mac couldn't be reached since the link was up. Retries
    /// in between show it rather than flicker back to "connecting".
    var lastFailure: String?
    /// "Try again" was just tapped and its check of the addresses is running.
    var trying = false
    var reconnectReason: ReconnectReason?
    /// When the project list on screen was last live; nil while it is.
    var listAsOf: Date?
    var queued: [QueuedAction] = []
    var identityRejected = false
    /// The certificate fingerprint the Mac presented when its identity changed.
    var newFingerprint: String?
    var identityCheckOpen = false
    var sheetOpen = false
    var tailscaleSettingsOpen = false
    var manageOpen = false
    /// Work to run once the sheet on screen has gone, for an action that opens
    /// another sheet in its place.
    @ObservationIgnored private var afterSheet: (() -> Void)?
    var reach: [UUID: MacReach] = [:]
    var tailscaleWorking = false
    var tailscaleFailure: String?
    var tailscalePage: TailscalePage?
    var summary: PairedSummary?
    @ObservationIgnored var pendingSummary: PairedSummary?
    var repairMacId: UUID?
    var repairReason: RepairReason?

    @ObservationIgnored private var slowTimer: DispatchWorkItem?
    @ObservationIgnored private var slowCeilingTimer: DispatchWorkItem?
    @ObservationIgnored private var tryingTimer: DispatchWorkItem?
    @ObservationIgnored private var queuedWork: [UUID: (LpmClient) -> Void] = [:]
    @ObservationIgnored private var reachCheckedAt: Date?

    // MARK: derived

    var isReady: Bool {
        if case .ready = model?.connection { return true }
        return false
    }

    /// How a sentence names the machine: its name, or "your Mac" while the name
    /// is still an address — and never another machine's name while pairing.
    var macLabel: String {
        guard let model, !pairing, !model.addingMac, let rec = model.activeRecord else { return "your Mac" }
        if !rec.isAddressName { return rec.displayName }
        return rec.isLinuxHost ? "your Linux host" : "your Mac"
    }

    var facts: LinkFacts? {
        guard let model, !model.demoMode, pairing || model.activeRecord != nil else { return nil }
        let record = model.activeRecord
        let hosts = pairing ? [host].compactMap { $0 } : (record?.hosts ?? [])
        let tailscale = BuiltInTailscale.shared
        var state = model.connection
        if case .connecting = state, let lastFailure { state = .failed(lastFailure) }
        return LinkFacts(
            state: state,
            pairing: pairing,
            pairingOverTailscale: pairing && hosts.contains { AddressKind.of($0) == .tailscale },
            needsRepair: model.needsRepair,
            credentialMissing: !pairing && model.connection == .idle && model.client == nil,
            identityMismatch: model.identityMismatch,
            identityRejected: identityRejected,
            online: network.isOnline,
            onCellular: network.medium == .cellular,
            atHome: atHome(hosts),
            hasAwayAddress: hosts.contains { AddressKind.of($0).worksAway },
            usesTailscaleApp: UserDefaults.standard.bool(forKey: Self.usesTailscaleAppKey),
            tailscaleEnabled: tailscale.enabled,
            tailscaleState: tailscale.status.state,
            probedAllFailed: probedAllFailed,
            farewell: pairing ? nil : record?.farewell,
            reconnectReason: reconnectReason)
    }

    nonisolated static let usesTailscaleAppKey = "pairing.usesTailscaleApp"

    /// On the Mac's own network: the Wi-Fi shares a subnet with one of its IPv4
    /// home addresses — or, when it's saved only by name or IPv6, the phone is on
    /// some Wi-Fi, which can't be ruled out.
    private func atHome(_ hosts: [String]) -> Bool {
        let home = hosts.filter { [.home, .localName].contains(AddressKind.of($0)) }
        let ipv4 = home.filter { NetworkWatcher.ipv4($0) != nil }
        if ipv4.contains(where: network.sharesSubnet(with:)) { return true }
        return network.medium == .wifi && ipv4.isEmpty && !home.isEmpty
    }

    var issue: ConnectionIssue? {
        facts.flatMap(ConnectionIssue.derive)
    }

    /// The issue worth showing right now: none while a reconnect is still quick.
    var visibleIssue: ConnectionIssue? {
        guard let issue else { return nil }
        if issue.isConnecting && !slowConnect { return nil }
        return issue
    }

    /// The issue worth a bar over the list: only one a tap on this iPhone fixes.
    var barIssue: ConnectionIssue? {
        guard let issue = visibleIssue, issue.needsYou else { return nil }
        return issue
    }

    /// A reconnect still in its first seconds, which changes nothing on screen
    /// but the line under the Mac's name.
    var quietReconnect: Bool { issue?.isConnecting == true && !slowConnect }

    /// How the bar names the machine: the title right above it shows its name.
    var macNoun: String {
        !pairing && model?.activeRecord?.isLinuxHost == true ? "your Linux host" : "your Mac"
    }

    /// How the phone expects to reach the Mac from the network it's on: its home
    /// address on the Mac's own network, otherwise one that works from anywhere.
    private var expectedRoute: AddressKind? {
        guard let model, !pairing, network.isOnline, let hosts = model.activeRecord?.hosts else { return nil }
        if network.medium != .cellular && atHome(hosts) { return .home }
        let kinds = hosts.map(AddressKind.of)
        if kinds.contains(.tailscale) { return .tailscale }
        return kinds.contains(.internet) ? .internet : nil
    }

    var statusLine: LinkStatusLine {
        LinkStatusLine.make(ready: isReady, demo: model?.demoMode ?? false,
                            kind: host.map(AddressKind.of), issue: issue,
                            slow: slowConnect, route: expectedRoute,
                            found: model?.recoveryStatus != nil)
    }

    var identityCode: String? { newFingerprint.map(IdentityCode.of(fingerprint:)) }

    // MARK: updates from the model

    /// How long a connect runs before the line says it's still going.
    private static let slowAfter: TimeInterval = 4
    /// Past this it's slow even while Built-in Tailscale is still starting.
    private static let slowCeiling: TimeInterval = 15

    func noteState(_ state: LpmClient.State, from old: LpmClient.State) {
        switch state {
        case .connecting:
            guard old != .connecting else { return }
            // A retry after a failure is already slow; restarting the clock
            // would flip the line back on every attempt.
            if case .failed = old { slowConnect = true; return }
            slowConnect = false
            armSlow(after: Self.slowAfter, waitingOnTailnet: true)
            slowCeilingTimer?.cancel()
            let ceiling = DispatchWorkItem { [weak self] in
                guard let self, case .connecting = self.model?.connection else { return }
                self.slowConnect = true
            }
            slowCeilingTimer = ceiling
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.slowCeiling, execute: ceiling)
        case .ready:
            cancelSlow()
            slowConnect = false
            connectedSince = Date()
            reconnectReason = nil
            probedAllFailed = false
            identityRejected = false
            lastFailure = nil
            endTrying()
            if let host { checks[host] = AddressCheck(reachable: true, detail: "ok", at: Date()) }
        case .failed(let raw):
            cancelSlow()
            if LpmClient.isOfflineHint(raw) { lastFailure = raw }
            endTrying()
        case .idle:
            cancelSlow()
        }
        if state != .ready { connectedSince = nil }
    }

    /// Built-in Tailscale coming back after a suspend is part of a normal open,
    /// so a connect waiting on it starts its count once it's up.
    private func armSlow(after delay: TimeInterval, waitingOnTailnet: Bool) {
        slowTimer?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, case .connecting = self.model?.connection else { return }
            let tailscale = BuiltInTailscale.shared
            if waitingOnTailnet && tailscale.enabled && tailscale.status.state == "starting" { return }
            self.slowConnect = true
        }
        slowTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func cancelSlow() {
        slowTimer?.cancel()
        slowCeilingTimer?.cancel()
    }

    func tailnetCameUp() {
        guard case .connecting = model?.connection, !slowConnect else { return }
        armSlow(after: Self.slowAfter, waitingOnTailnet: false)
    }

    func clearFailure() {
        lastFailure = nil
        probedAllFailed = false
    }

    func noteTrying() {
        trying = true
        tryingTimer?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.trying = false }
        tryingTimer = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    private func endTrying() {
        tryingTimer?.cancel()
        trying = false
    }

    func noteProbe(_ outcomes: [HostProbe.Outcome]) {
        guard !outcomes.isEmpty else { return }
        noteChecks(outcomes)
        probedAllFailed = !outcomes.contains(where: \.reachable)
        if !probedAllFailed { endTrying() }
    }

    func noteChecks(_ outcomes: [HostProbe.Outcome]) {
        let now = Date()
        for o in outcomes where o.detail != "cancelled" {
            checks[o.host] = AddressCheck(reachable: o.reachable, detail: o.detail, at: now)
        }
    }

    /// Check each address on its own, for the lists that show every result.
    func test(_ hosts: [String], port: Int, updatingIssue: Bool) async {
        testing.formUnion(hosts)
        let outcomes = await HostProbe.checkAll(hosts, port: port)
        testing.subtract(hosts)
        if updatingIssue && !isReady { noteProbe(outcomes) } else { noteChecks(outcomes) }
    }

    func resetSession() {
        cancelSlow()
        host = nil
        pairing = false
        checks = [:]
        probedAllFailed = false
        connectedSince = nil
        slowConnect = false
        reconnectReason = nil
        lastFailure = nil
        endTrying()
        listAsOf = nil
        queued = []
        queuedWork = [:]
        identityRejected = false
        newFingerprint = nil
        identityCheckOpen = false
        tailscaleFailure = nil
    }

    func afterSheetCloses(_ work: @escaping () -> Void) { afterSheet = work }

    func runAfterSheet() {
        let work = afterSheet
        afterSheet = nil
        work?()
    }

    // MARK: actions waiting for the Mac

    func enqueue(_ verb: String, project: String, _ work: @escaping (LpmClient) -> Void) {
        let action = QueuedAction(project: project, verb: verb)
        queued.append(action)
        queuedWork[action.id] = work
        armExpiry(action.id)
    }

    func queued(for project: String) -> [QueuedAction] {
        queued.filter { $0.project == project }
    }

    var waitingCount: Int { queued.filter { !$0.expired }.count }

    /// Send everything still waiting, in the order it was tapped.
    func flushQueued(to client: LpmClient) {
        for action in queued where !action.expired {
            queuedWork[action.id]?(client)
            queuedWork[action.id] = nil
        }
        queued.removeAll { !$0.expired }
    }

    func cancelQueued(_ id: UUID) {
        queued.removeAll { $0.id == id }
        queuedWork[id] = nil
    }

    func retryQueued(_ id: UUID) {
        guard let index = queued.firstIndex(where: { $0.id == id }) else { return }
        if isReady, let client = model?.client {
            queuedWork[id]?(client)
            cancelQueued(id)
            return
        }
        queued[index].expired = false
        queued[index].queuedAt = Date()
        armExpiry(id)
    }

    private func armExpiry(_ id: UUID) {
        DispatchQueue.main.asyncAfter(deadline: .now() + QueuedAction.lifetime) { [weak self] in
            guard let self, let index = self.queued.firstIndex(where: { $0.id == id }),
                  Date().timeIntervalSince(self.queued[index].queuedAt) >= QueuedAction.lifetime - 1 else { return }
            self.queued[index].expired = true
        }
    }

    // MARK: other saved machines

    /// Check which of the other saved machines answer, at most every 45 seconds.
    func refreshReach(force: Bool = false) {
        guard let model, !model.demoMode else { return }
        if !force, let last = reachCheckedAt, Date().timeIntervalSince(last) < 45 { return }
        reachCheckedAt = Date()
        for mac in model.macs where mac.localId != model.activeMacId {
            if reach[mac.localId] == nil { reach[mac.localId] = .checking }
            let id = mac.localId
            Task { @MainActor in
                let up = await HostProbe.anyReachable(mac.hosts, port: Int(mac.port))
                self.reach[id] = up ? .online : .offline
            }
        }
    }

    // MARK: Built-in Tailscale from the problem

    /// Turn Built-in Tailscale on and open its sign-in page when it has one, so
    /// fixing "away from home" is one tap from where the problem shows.
    func turnOnTailscale() {
        guard !tailscaleWorking else { return }
        tailscaleWorking = true
        tailscaleFailure = nil
        Task { @MainActor in
            defer { self.tailscaleWorking = false }
            do {
                if let url = try await BuiltInTailscale.shared.signIn() {
                    self.tailscalePage = TailscalePage(url: url)
                }
            } catch {
                self.tailscaleFailure = error.localizedDescription
            }
        }
    }
}
