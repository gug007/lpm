import Foundation
import SwiftUI
import UIKit
import UserNotifications

/// Top-level observable state: the connection, the project list, and per-project
/// status. Views observe this; the client drives it.
@Observable @MainActor
final class AppModel {
    var connection: LpmClient.State = .idle
    var projects: [Project] = []
    // False until the first projects list arrives, so the UI can tell an empty
    // list apart from "still loading" and show a spinner instead of "No projects".
    var projectsLoaded = false
    var terminals: [String: [TerminalInfo]] = [:] // project -> terminals
    var slashCommands: [String: [SlashCommand]] = [:] // terminal id -> commands
    var mentions: [String: [MentionEntry]] = [:] // project -> @-mention targets
    var history: [String: [HistoryRow]] = [:] // project -> recent sent prompts
    var automations: [AutomationJob] = []
    var automationsLoaded = false
    var automationHistory: [String: [AutomationHistoryEntry]] = [:]
    var automationHistoryLoading: Set<String> = []
    var automationLiveOutput: [String: AutomationLiveOutput] = [:]
    var automationPending: Set<String> = []
    var automationError: String?
    var automationFollowupError: [String: String] = [:]
    // Automation authoring (create/edit/delete from the phone editor sheet).
    // `jobConfigBody` holds the raw YAML body fetched for an edit; the loading key
    // marks which job it belongs to. A save/delete sets `jobMutationInFlight` (Save
    // spinner) and, on success, bumps `jobMutationDoneToken` so the open sheet
    // dismisses. A guarded timeout surfaces an error if the Mac never replies.
    var jobConfigBody: [String: Any]?
    var jobConfigError: String?
    var jobConfigLoadingKey: String?
    var jobMutationInFlight = false
    var jobMutationError: String?
    var jobMutationDoneToken = 0
    @ObservationIgnored private let jobMutationTimeout = GenerationTimeout<String>()

    // Local agent token-usage stats (the desktop Stats page). `stats` is nil until
    // the first load lands; `statsDays` is the selected period (1/7/30 days, 0 =
    // all time). `statsActive` re-issues the query after a reconnect.
    var stats: AgentStats?
    var statsLoading = false
    var statsError: String?
    var statsDays = 30
    @ObservationIgnored private var statsActive = false
    // The stats scan replies asynchronously and can arrive out of order (the Mac
    // scans history files off the socket), so a generation-guarded timeout keeps a
    // stale timeout from clearing a newer in-flight load.
    @ObservationIgnored private let statsTimeout = GenerationTimeout<String>()

    // Saved Macs and which one is live. The phone talks to exactly one Mac at a
    // time; `activeMacId` names it. An empty `macs` list means "not paired with any
    // Mac" and drives the root gate to the pairing screen.
    var macs: [MacRecord] = []
    var activeMacId: UUID?
    // Drives the "Add a Mac" pairing sheet over the projects list. Cleared once a
    // pairing succeeds (the new Mac becomes active) or the user cancels.
    var addingMac = false

    // A brief status shown while automatic endpoint recovery is finding the active
    // Mac on the local network and reconnecting to it ("Found <name>,
    // reconnecting…"). Nil when idle; cleared once the link comes back.
    var recoveryStatus: String?

    // MARK: composer parity

    // The user's enabled AI-rewrite actions (global, from composer-actions.json).
    var composerActions: [ComposerAction] = []
    // Per-action remembered variant count (1–5) for the AI-rewrite sheet, keyed by
    // action id (and "__freeform__" for the custom field). Session-scoped.
    var actionVariantCounts: [String: Int] = [:]
    // project -> discovered services (for the @-mention "service logs" source).
    var services: [String: [ServiceInfo]] = [:]
    var servicesRunning: [String: Bool] = [:]
    // Captured service-pane output, keyed by serviceLogsKey; one-shot, consumed by
    // the composer which injects it inline then clears it.
    var serviceLogsResult: [String: String] = [:]
    var serviceLogsError: [String: String] = [:]

    // Headless background action runs the phone started (or re-attached to), keyed
    // by runId. `backgroundRuns` holds the latest polled snapshot; `backgroundRunInfo`
    // carries project/label/startedAt known at start time so a run shows before its
    // first poll; `backgroundRunErrors` records a rejected start.
    var backgroundRuns: [String: ActionBgOutput] = [:]
    var backgroundRunInfo: [String: BackgroundRunInfo] = [:]
    var backgroundRunErrors: [String: String] = [:]

    // Rich history screen (historyQuery). The reply carries no echo of its params,
    // so a per-request generation queue (below) records whether each reply should
    // replace (first page) or append (next page), and drops superseded replies.
    var historyItems: [HistoryItem] = []
    var historyHasMore = false
    var historyLoading = false
    var historyLoadingMore = false
    var historyFolders: [HistoryFolder] = []
    @ObservationIgnored private var historyQueryParams: (project: String?, search: String?, favoritesOnly: Bool, folder: String?)
        = (nil, nil, false, nil)
    // Each request bumps the generation; replies (delivered in request order over
    // the connection) are matched FIFO, and only the latest generation's reply may
    // replace/append — a stale reply from a superseded filter/search is dropped.
    @ObservationIgnored private var historyReqGen = 0
    @ObservationIgnored private var historyPending: [(gen: Int, paging: Bool)] = []
    // Whether the history screen is open, so a reconnect re-issues its query fresh.
    @ObservationIgnored private var historyActive = false
    // Tracks whether the link was live, so a transition AWAY from ready is detected
    // as a socket teardown (a transient background→foreground drop goes
    // .connecting → .ready without ever passing through .failed).
    @ObservationIgnored private var wasReady = false

    // Per-terminal composer stores (tabs + attachments + transform state), retained
    // so composer drafts survive leaving/re-entering a terminal. Not observed here:
    // each store is observed individually by its composer.
    @ObservationIgnored private var composerStores: [String: ComposerStore] = [:]
    // reqId -> terminal id, routing streamed transform replies to the right store.
    @ObservationIgnored private var transformRoutes: [String: String] = [:]
    // terminal id -> a closure that captures the phone's own xterm scrollback,
    // registered by WebTerminalView (for the @-mention "terminal output" source).
    @ObservationIgnored var terminalCapture: [String: (_ lines: Int, _ done: @escaping (String) -> Void) -> Void] = [:]

    // Notification preferences. The per-type toggles keep their stored values even
    // when the master is off; the effective values sent to the desktop are
    // `notifyEnabled && notifyX`. Any change re-sends the (idempotent) apnsToken
    // frame so the desktop's per-device prefs stay in sync.
    var notifyEnabled: Bool = AppModel.loadBoolPref(AppModel.notifyEnabledKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }
    var notifyWaiting: Bool = AppModel.loadBoolPref(AppModel.notifyWaitingKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }
    var notifyDone: Bool = AppModel.loadBoolPref(AppModel.notifyDoneKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }
    var notifyError: Bool = AppModel.loadBoolPref(AppModel.notifyErrorKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }
    var notifyAutomationStarted: Bool = AppModel.loadBoolPref(AppModel.notifyAutomationStartedKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }
    var notifyAutomationDone: Bool = AppModel.loadBoolPref(AppModel.notifyAutomationDoneKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }
    var notifyAutomationError: Bool = AppModel.loadBoolPref(AppModel.notifyAutomationErrorKey) {
        didSet { persistNotifyPrefs(); sendApnsTokenIfPossible() }
    }

    // Sidebar folders, matching the desktop: `order` interleaves project names and
    // "group:<id>" tokens; `groups` are the folder defs.
    var sidebarOrder: [String] = []
    var groups: [ProjectFolder] = []
    // terminal id -> current owner. Absent = nobody/unknown (this phone may show
    // it). A terminal is rendered live in exactly one surface; when the desktop
    // (or another phone) owns it, this phone shows a "take control" placeholder.
    var controlOwner: [String: ControlOwner] = [:]
    // A failed duplicate/remove message to show once (e.g. "cannot duplicate an
    // SSH project"). The list itself refreshes off the projects-changed push.
    var actionError: String? {
        didSet { if actionError != nil { Haptics.error() } }
    }
    // The duplicate modal's initial toggle state, mirrored from the desktop's
    // persisted settings so the phone's modal opens with matching defaults.
    var duplicateDefaults = DuplicateOptions()
    // Live progress of an in-flight duplicate batch (nil when idle).
    var duplicateProgress: DuplicateProgress?
    // A non-fatal notice to show once (e.g. copies made but a run task needs the
    // Mac app open). Distinct from actionError, which is a hard failure.
    var notice: String?
    var pendingNotificationTarget: NotificationOpenTarget?
    // project -> desired running state while a Start/Stop is in flight, so the UI
    // can spin until the projects push confirms it (or a timeout gives up).
    var pendingRun: [String: Bool] = [:]
    // project -> service -> desired running state while a toggle is in flight,
    // cleared the same way as pendingRun.
    var pendingServiceToggle: [String: [String: Bool]] = [:]
    // Projects with a new-terminal/run-action in flight: the desktop creates the
    // terminal asynchronously, so show a placeholder row until it appears.
    var creatingTerminals: Set<String> = []
    // Terminal ids present when the create was requested; a response containing
    // an id outside this set means the new terminal has landed.
    @ObservationIgnored private var creatingBaseline: [String: Set<String>] = [:]
    @ObservationIgnored private let creatingTimeout = GenerationTimeout<String>()
    // A pending "switch to the terminal this run spawns" watcher, keyed by project.
    // Any newer create intent invalidates it (see markTerminalCreating) so a manual
    // "+" terminal or a later run can't trigger a stale switch.
    @ObservationIgnored private var spawnCallbacks: [String: (TerminalInfo) -> Void] = [:]
    // project -> terminal ids with a close in flight. The row is removed
    // optimistically (the destructive swipe already animated it away) and
    // filtered from incoming lists until the desktop confirms the close, so a
    // stale response can't flash the row back. A timeout gives up and reloads,
    // resurfacing the row if the close actually failed.
    @ObservationIgnored private var closingTerminals: [String: Set<String>] = [:]
    @ObservationIgnored private let closingTimeout = GenerationTimeout<String>()

    // Terminal streams go straight to whichever TerminalScreen is subscribed; the
    // emulator (SwiftTerm) holds the buffer, not this model. Seed and live output
    // are kept separate so the view can reset the emulator before replaying the
    // seed (raw scrollback) — otherwise a TUI's cursor-positioned redraws overlap.
    @ObservationIgnored var onTerminalSeed: [String: (_ cols: Int, _ rows: Int, _ data: String) -> Void] = [:]
    @ObservationIgnored var onTerminalOutput: [String: (String) -> Void] = [:]
    // Composer "send": routed into the terminal's web view so it can apply the
    // same bracketed-paste wrapping the desktop does (which needs xterm's live
    // bracketed-paste mode). Registered by WebTerminalView.
    @ObservationIgnored var terminalSubmit: [String: (String) -> Void] = [:]
    // A prompt queued to submit into a terminal as soon as its web view is mounted
    // and seeded (used by "Ask agent…", which navigates to a terminal that may not
    // be on screen yet). Flushed + cleared by WebTerminalView once ready.
    @ObservationIgnored var pendingAgentPrompt: [String: String] = [:]

    // MARK: git review state

    // Git-review state + operations for every project, reached as `model.git`. Split
    // into its own store so its ~40 properties observe and reset independently of the
    // rest of the app.
    var git = GitReviewStore()

    // Loaded file-viewer contents, keyed by "<project>\n<path>", so the FileViewer
    // sheet can render loading / content / error for the file it opened.
    var loadedFiles: [String: FileLoad] = [:]

    @ObservationIgnored private(set) var client: LpmClient?
    // The hex APNs device token (once registration succeeds). The token and a live
    // authed connection can land in either order; whichever is second sends the
    // apnsToken frame (idempotent, re-sent on every reconnect).
    @ObservationIgnored private var apnsTokenHex: String?
    // Ask for notification permission only once; iOS no-ops a repeat prompt.
    @ObservationIgnored private var didRequestPushAuthorization = false
    // The addresses the current attempt is racing, so a failure can name exactly
    // what it tried (LAN vs Tailscale) instead of a generic "can't reach".
    @ObservationIgnored private var attemptHosts: [String] = []
    // Guards the opportunistic host migration in onState against overlapping
    // re-probes while one is already in flight.
    @ObservationIgnored private var repicking = false
    // The host the live client was built for, so migration only rebuilds when a
    // *different* address becomes reachable.
    @ObservationIgnored private var currentHost: String?
    // The candidate addresses/port of an in-flight pairing, stamped onto the
    // saved-Mac record once the `paired` frame lands.
    @ObservationIgnored private var pendingPairHosts: [String] = []
    @ObservationIgnored private var pendingPairPort: UInt16 = MacStore.defaultPort

    // Local-network discovery used only for automatic endpoint recovery: when the
    // active Mac's saved addresses stop responding, browse for it and reconnect on
    // the fresh address it advertises. `recovering` gates a single bounded browse;
    // `recoveryWindow` bounds it in time; `recoveryHandled` dedupes resolves within
    // one browse so each Mac is chased once.
    @ObservationIgnored private let discovery = MacDiscovery()
    @ObservationIgnored private var recovering = false
    @ObservationIgnored private var recoveryWindow: DispatchWorkItem?
    @ObservationIgnored private var recoveryHandled: Set<String> = []

    init() {
        git.model = self
    }

    func bootstrap() {
        MacStore.migrateLegacyIfNeeded()
        macs = MacStore.loadRecords()
        activeMacId = MacStore.loadActiveId() ?? macs.first?.localId
        guard let cred = activeCredential() else { return }
        connectBest(credential: cred)
    }

    /// The saved Mac the phone is (or should be) connected to.
    var activeRecord: MacRecord? {
        guard let id = activeMacId else { return nil }
        return macs.first { $0.localId == id }
    }

    /// The active Mac's stored credential, if any.
    private func activeCredential() -> LpmClient.Credential? {
        guard let id = activeMacId, macs.contains(where: { $0.localId == id }) else { return nil }
        return Keychain.load(for: id)
    }

    private func persistMacs() {
        MacStore.saveRecords(macs)
        MacStore.saveActiveId(activeMacId)
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

    /// A Tailscale CGNAT address (100.64.0.0/10) from the candidates, if any.
    private static func cgnatHost(_ hosts: [String]) -> String? {
        hosts.first(where: isCGNAT)
    }

    /// True for a Tailscale CGNAT address (100.64.0.0/10): an IPv4 whose first
    /// octet is 100 and second is in 64...127.
    private static func isCGNAT(_ host: String) -> Bool {
        let octets = host.split(separator: ".").compactMap { Int($0) }
        return octets.count == 4 && octets[0] == 100 && (64...127).contains(octets[1])
    }

    /// Fold a freshly discovered address into a record's host list: the fresh host
    /// leads, and everything else keeps its order — except a plain LAN IPv4 literal
    /// that the fresh address replaces, which is dropped as stale. Tailscale CGNAT
    /// addresses, hostnames (e.g. `mac.local`, a MagicDNS name), and any IPv6
    /// address survive as the away-from-home fallback.
    private static func mergedHosts(existing: [String], fresh: String) -> [String] {
        var out = [fresh]
        for h in existing where h != fresh {
            if isIPv4Literal(h) && !isCGNAT(h) { continue }
            out.append(h)
        }
        return out
    }

    /// True for a dotted-quad IPv4 literal (four 0–255 octets).
    private static func isIPv4Literal(_ host: String) -> Bool {
        let octets = host.split(separator: ".", omittingEmptySubsequences: false)
        return octets.count == 4 && octets.allSatisfy { Int($0).map { (0...255).contains($0) } ?? false }
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
              c === client, !repicking, let cred = activeCredential() else { return }
        repicking = true
        Task { @MainActor in
            defer { repicking = false }
            let winner = await HostProbe.firstReachable(savedHosts(), port: savedPort())
            guard let winner, winner != currentHost, c === client else { return }
            connect(host: winner, port: savedPort(), credential: cred)
        }
    }

    // MARK: automatic endpoint recovery

    /// The saved addresses have stopped answering (the same stale-link condition
    /// `repickHostIfStale` reacts to). If the active Mac has a known identity,
    /// browse the local network for it: a Mac whose LAN address changed (new DHCP
    /// lease, moved networks) re-appears here under the same identity, and we
    /// migrate the connection to its fresh address. Bounded to a short window and
    /// re-armed on each slow retry's hint, so it never browses in the background.
    private func startRecoveryIfStale(_ s: LpmClient.State, from c: LpmClient) {
        guard case .failed(LpmClient.offlineHint) = s,
              c === client, !recovering,
              let sid = activeRecord?.serverId, !sid.isEmpty else { return }
        recovering = true
        recoveryHandled = []
        discovery.onChange = { [weak self] found in self?.handleDiscovered(found) }
        discovery.start()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.stopBrowsing()
            self.recoveryStatus = nil
        }
        recoveryWindow = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: work)
    }

    /// Stop the recovery browse (leaves `recoveryStatus` alone — the reconnect it
    /// kicked off clears that when the link returns, or the window timeout does).
    private func stopBrowsing() {
        recoveryWindow?.cancel()
        recoveryWindow = nil
        discovery.onChange = nil
        discovery.stop()
        recovering = false
        recoveryHandled = []
    }

    /// Stop browsing and clear any recovery status — used when the app backgrounds
    /// or the session is torn down.
    func suspendRecoveryDiscovery() {
        stopBrowsing()
        recoveryStatus = nil
    }

    /// A batch of discovered Macs arrived during recovery. For any that match a
    /// saved record by identity, resolve a fresh address and heal the record —
    /// reconnecting only for the active Mac, updating the rest in place.
    private func handleDiscovered(_ found: [MacDiscovery.DiscoveredMac]) {
        for mac in found {
            guard let sid = mac.serverId, !sid.isEmpty,
                  !recoveryHandled.contains(sid),
                  let record = macs.first(where: { $0.serverId == sid }) else { continue }
            recoveryHandled.insert(sid)
            let localId = record.localId
            let isActive = localId == activeMacId
            Task { @MainActor in
                guard let resolved = await self.discovery.resolve(mac) else {
                    // Resolution failed — allow a later batch to retry this Mac.
                    self.recoveryHandled.remove(sid)
                    return
                }
                self.applyRecovered(localId: localId, host: resolved.host,
                                    port: resolved.port, name: mac.name, reconnect: isActive)
            }
        }
    }

    /// Fold a freshly resolved address into a saved record and persist it. For the
    /// active Mac (and only while it's still offline), rebuild the client on the
    /// fresh address and reconnect.
    private func applyRecovered(localId: UUID, host: String, port: UInt16, name: String, reconnect: Bool) {
        guard let idx = macs.firstIndex(where: { $0.localId == localId }) else { return }
        macs[idx].hosts = Self.mergedHosts(existing: macs[idx].hosts, fresh: host)
        macs[idx].port = port
        if !name.isEmpty, macs[idx].isAddressName { macs[idx].name = name }
        persistMacs()
        guard reconnect else { return }
        // A parallel path (repickHostIfStale, a manual retry) may have already
        // reconnected — don't tear down a live link.
        if case .ready = connection { stopBrowsing(); recoveryStatus = nil; return }
        stopBrowsing()
        recoveryStatus = "Found \(macs[idx].displayName), reconnecting…"
        if let cred = activeCredential() {
            connect(host: host, port: Int(port), credential: cred)
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

    /// Begin pairing a Mac — the first Mac, or an additional one from "Add a Mac".
    /// The saved-Mac record isn't created until the `paired` frame lands (see
    /// `handlePaired`), which is also where a re-pair of an already-saved Mac is
    /// deduped by serverId. Tears down any current session first, so pairing a new
    /// Mac cleanly replaces the live one.
    func pair(hosts: [String], port: Int, code: String) {
        resetSessionState()
        pendingPairHosts = hosts
        pendingPairPort = UInt16(clamping: port)
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
        // Even a `.ready` state can be stale after backgrounding (half-open
        // socket) — probe it instead of trusting it, so a dead link is noticed
        // now rather than on the next heartbeat.
        if case .ready = connection { client?.verifyNow(); return }
        // Reuse the live client when we have one — it re-auths and re-subscribes
        // to the terminals this phone was watching. Only rebuild (and re-probe
        // for a reachable address) on a cold start with no client.
        if let client {
            client.connect()
        } else if let cred = activeCredential() {
            connectBest(credential: cred)
        }
    }

    /// The "Retry" button: force an immediate attempt now, skipping any backoff.
    /// Re-probes for a reachable address if we don't have a live client yet.
    func retryConnection() {
        if let client {
            client.retryNow()
        } else if let cred = activeCredential() {
            connectBest(credential: cred)
        }
    }

    private func savedHosts() -> [String] {
        let hosts = activeRecord?.hosts ?? []
        return hosts.isEmpty ? ["127.0.0.1"] : hosts
    }

    private func savedPort() -> Int {
        Int(activeRecord?.port ?? MacStore.defaultPort)
    }

    // MARK: saved Macs

    /// Switch the live connection to another saved Mac: tear down the current
    /// session, reset all cached per-session state, then connect to the target.
    func switchTo(_ record: MacRecord) {
        guard record.localId != activeMacId else { return }
        resetSessionState()
        activeMacId = record.localId
        MacStore.saveActiveId(activeMacId)
        if let cred = Keychain.load(for: record.localId) {
            connectBest(credential: cred)
        }
    }

    /// Open the "Add a Mac" pairing sheet. Pairing there creates (or, by serverId,
    /// re-adopts) a saved-Mac record and switches to it on success.
    func beginAddMac() { addingMac = true }

    /// Dismiss the "Add a Mac" sheet: reconnect to the Mac that was active before,
    /// whose session `pair()` tore down. A pairing attempt still in flight (or
    /// failed) leaves a client that never authenticated — tear it down first so it
    /// can't later stamp the wrong hosts onto a new record, and so the previous Mac
    /// actually reconnects. A client that DID authenticate is a pairing that just
    /// succeeded (this dismissal is the post-`handlePaired` one); its `deviceId` is
    /// non-nil, so the guard skips it and the fresh connection is left untouched.
    func cancelAddMac() {
        addingMac = false
        if let client, client.deviceId == nil {
            client.disconnect()
            self.client = nil
            currentHost = nil
            pendingPairHosts = []
        }
        if client == nil, let cred = activeCredential() { connectBest(credential: cred) }
    }

    /// Give the active Mac a user-chosen display name. A blank/whitespace name —
    /// or saving the learned name unchanged — clears it, reverting to (or staying
    /// on) the learned name, so future serverName updates aren't pinned over. Only
    /// touches `customName`, which learning/re-pairing never overwrites, so the
    /// rename survives reconnects.
    func renameActiveMac(_ newName: String) {
        guard let id = activeMacId, let idx = macs.firstIndex(where: { $0.localId == id }) else { return }
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        macs[idx].customName = (trimmed.isEmpty || trimmed == macs[idx].name) ? nil : trimmed
        persistMacs()
    }

    /// Replace the active Mac's addresses and port (the manual endpoint editor).
    /// The saved credential is untouched — this is not a re-pair — so the change
    /// only affects how the phone reaches the Mac. Re-probes the new addresses and
    /// reconnects on whichever answers.
    func updateActiveMacEndpoint(hosts: [String], port: UInt16) {
        guard let id = activeMacId, let idx = macs.firstIndex(where: { $0.localId == id }) else { return }
        let cleaned = hosts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return }
        macs[idx].hosts = cleaned
        macs[idx].port = port
        persistMacs()
        if let cred = activeCredential() { connectBest(credential: cred) }
    }

    /// The Mac `removeActiveMac()` would switch to after removing the active one
    /// (nil if the active Mac is the only one). Shared with the confirmation copy so
    /// the named fallback can never diverge from the actual behavior.
    var nextMacAfterRemoval: MacRecord? {
        macs.first { $0.localId != activeMacId }
    }

    /// Remove the active Mac: drop its connection, delete its record + Keychain
    /// credential, then switch to another saved Mac if one remains — otherwise
    /// return to the pairing screen.
    func removeActiveMac() {
        guard let id = activeMacId else { return }
        let next = nextMacAfterRemoval
        resetSessionState()
        Keychain.delete(for: id)
        macs.removeAll { $0.localId == id }
        activeMacId = next?.localId
        persistMacs()
        if let next, let cred = Keychain.load(for: next.localId) {
            connectBest(credential: cred)
        }
    }

    /// A fresh pairing landed. Persist the credential and create the saved-Mac
    /// record — or, when the Mac's `serverId` matches one we already have (a
    /// re-pair), refresh that record in place instead of duplicating it. Either
    /// way the paired Mac becomes active.
    private func handlePaired(deviceId: String, token: String, serverId: String?, serverName: String?) {
        let hosts = pendingPairHosts.isEmpty ? savedHosts() : pendingPairHosts
        let port = pendingPairPort
        pendingPairHosts = []

        let localId: UUID
        if let sid = serverId, !sid.isEmpty, let idx = macs.firstIndex(where: { $0.serverId == sid }) {
            localId = macs[idx].localId
            macs[idx].hosts = hosts
            macs[idx].port = port
            if let name = serverName, !name.isEmpty { macs[idx].name = name }
        } else {
            let record = MacRecord(localId: UUID(), serverId: serverId,
                                   name: serverName?.trimmedNonEmpty ?? hosts.first ?? "My Mac",
                                   hosts: hosts, port: port)
            macs.append(record)
            localId = record.localId
        }
        Keychain.save(deviceId: deviceId, token: token, for: localId)
        activeMacId = localId
        persistMacs()
        addingMac = false
    }

    /// A reconnect reached `ready` carrying identity: learn/refresh the active
    /// record's serverId and name.
    private func learnIdentity(serverId: String?, serverName: String?) {
        guard let id = activeMacId, let idx = macs.firstIndex(where: { $0.localId == id }) else { return }
        var changed = false
        if let sid = serverId, !sid.isEmpty, macs[idx].serverId != sid {
            macs[idx].serverId = sid
            changed = true
        }
        if let name = serverName?.trimmedNonEmpty, macs[idx].name != name {
            macs[idx].name = name
            changed = true
        }
        if changed { persistMacs() }
    }

    /// Tear down the live connection to the current Mac and clear every cached
    /// per-session value, so switching Macs (or removing one) starts clean. Does
    /// NOT touch the saved-Mac records or their Keychain credentials.
    private func resetSessionState() {
        client?.disconnect()
        client = nil
        currentHost = nil
        stopBrowsing()
        recoveryStatus = nil

        connection = .idle
        projects = []
        projectsLoaded = false
        terminals = [:]
        slashCommands = [:]
        mentions = [:]
        history = [:]
        automations = []
        automationsLoaded = false
        automationHistory = [:]
        automationHistoryLoading = []
        automationLiveOutput = [:]
        automationPending = []
        automationError = nil
        automationFollowupError = [:]
        jobConfigBody = nil
        jobConfigError = nil
        jobConfigLoadingKey = nil
        jobMutationInFlight = false
        jobMutationError = nil
        jobMutationTimeout.cancel("job")
        stats = nil
        statsLoading = false
        statsError = nil
        statsDays = 30
        statsActive = false
        composerActions = []
        actionVariantCounts = [:]
        services = [:]
        servicesRunning = [:]
        serviceLogsResult = [:]
        serviceLogsError = [:]
        backgroundRuns = [:]
        backgroundRunInfo = [:]
        backgroundRunErrors = [:]
        historyItems = []
        historyHasMore = false
        historyLoading = false
        historyLoadingMore = false
        historyFolders = []
        historyReqGen = 0
        historyPending = []
        historyActive = false
        wasReady = false
        composerStores = [:]
        transformRoutes = [:]
        terminalCapture = [:]
        sidebarOrder = []
        groups = []
        controlOwner = [:]
        actionError = nil
        pendingRun = [:]
        pendingServiceToggle = [:]
        creatingTerminals = []
        creatingBaseline = [:]
        creatingTimeout.cancelAll()
        spawnCallbacks = [:]
        closingTerminals = [:]
        closingTimeout.cancelAll()
        // The whole git-review cluster (state, caches, pending work) resets by
        // swapping in a fresh store; the discarded one's pending timers no-op
        // through their weak references.
        git = GitReviewStore()
        git.model = self
        loadedFiles = [:]
        pendingAgentPrompt = [:]
    }

    // MARK: push notifications

    /// The APNs device token arrived (from the app delegate). Store it and send the
    /// registration frame if the connection is already live.
    func setApnsDeviceToken(_ hex: String) {
        apnsTokenHex = hex
        sendApnsTokenIfPossible()
    }

    /// After the first `ready`: ask for notification permission once, then register
    /// for remote notifications (registering again after a denial is a no-op).
    private func requestPushRegistration() {
        if didRequestPushAuthorization {
            UIApplication.shared.registerForRemoteNotifications()
            return
        }
        didRequestPushAuthorization = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    /// Register (or refresh) this device's push identity: the APNs token, the build's
    /// APNs environment, and the shared push key. Sent whenever both a token and a
    /// live authed connection exist — re-sent after every reconnect since the token
    /// can rotate and the frame is idempotent.
    private func sendApnsTokenIfPossible() {
        guard let hex = apnsTokenHex, case .ready = connection, let client else { return }
        #if DEBUG
        let env = "sandbox"
        #else
        let env = "production"
        #endif
        let key = PushKey.loadOrCreate().base64EncodedString()
        client.sendApnsToken(token: hex, env: env, key: key,
                             notifyWaiting: notifyEnabled && notifyWaiting,
                             notifyDone: notifyEnabled && notifyDone,
                             notifyError: notifyEnabled && notifyError,
                             notifyAutomationStarted: notifyEnabled && notifyAutomationStarted,
                             notifyAutomationDone: notifyEnabled && notifyAutomationDone,
                             notifyAutomationError: notifyEnabled && notifyAutomationError)
    }

    static let notifyEnabledKey = "lpm.notify.enabled"
    static let notifyWaitingKey = "lpm.notify.waiting"
    static let notifyDoneKey = "lpm.notify.done"
    static let notifyErrorKey = "lpm.notify.error"
    static let notifyAutomationStartedKey = "lpm.notify.automation.started"
    static let notifyAutomationDoneKey = "lpm.notify.automation.done"
    static let notifyAutomationErrorKey = "lpm.notify.automation.error"

    // Absent keys default to enabled, so a fresh install opts in to every push type.
    private static func loadBoolPref(_ key: String) -> Bool {
        UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    private func persistNotifyPrefs() {
        let d = UserDefaults.standard
        d.set(notifyEnabled, forKey: Self.notifyEnabledKey)
        d.set(notifyWaiting, forKey: Self.notifyWaitingKey)
        d.set(notifyDone, forKey: Self.notifyDoneKey)
        d.set(notifyError, forKey: Self.notifyErrorKey)
        d.set(notifyAutomationStarted, forKey: Self.notifyAutomationStartedKey)
        d.set(notifyAutomationDone, forKey: Self.notifyAutomationDoneKey)
        d.set(notifyAutomationError, forKey: Self.notifyAutomationErrorKey)
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
    /// Ask the server for a fresh seed on an already-subscribed terminal — used
    /// when the terminal web view reloads (WebContent process death) and its
    /// emulator restarts empty. Re-sending `sub` replays the current screen.
    func reseed(_ id: String) { client?.subscribe(id) }
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
        Haptics.tap()
        markRunPending(p.name, desired: true)
        client?.startProject(p.name, profile: profile)
    }
    func stopProject(_ p: Project) {
        Haptics.tap()
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
    /// Rename a project's display label (empty clears it, falling back to the id).
    /// The list refreshes off the projects-changed push; only a failure surfaces.
    func renameProject(_ p: Project, name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed != p.label else { return }
        client?.renameProject(project: p.name, name: trimmed)
    }

    // Sidebar folder management. Each op writes the Mac's groups.json + settings and
    // replies the updated layout (applied in onSidebarMutation); folders are matched
    // by name, so create/rename/delete/move all key off the folder's display name.
    func createFolder(name: String) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        client?.sidebarCreateFolder(name: trimmed)
    }
    func renameFolder(_ folder: ProjectFolder, newName: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != folder.name else { return }
        client?.sidebarRenameFolder(name: folder.name, newName: trimmed)
    }
    func deleteFolder(_ folder: ProjectFolder) { client?.sidebarDeleteFolder(name: folder.name) }
    /// Move a project into `folder` (created if it doesn't exist), or to the top
    /// level when `folder` is nil.
    func moveProject(_ project: Project, toFolder folder: String?) {
        client?.sidebarMoveProject(project: project.name, folder: folder)
    }

    /// Open a project file in the viewer sheet: mark it loading and request its
    /// contents (the reply lands in onFile). A timeout gives up so a lost reply
    /// can't spin forever.
    func requestFile(project: String, path: String) {
        let key = project + "\n" + path
        loadedFiles[key] = FileLoad(content: nil, truncated: false, error: nil, loading: true)
        client?.readFile(project: project, path: path)
        DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
            guard let self, self.loadedFiles[key]?.loading == true else { return }
            self.loadedFiles[key] = FileLoad(content: nil, truncated: false,
                                             error: "Reading the file timed out.", loading: false)
        }
    }
    /// Start/stop one service. Mirrors markRunPending: the row spins until the
    /// projects push confirms the desired state (or a timeout gives up).
    func toggleService(_ project: String, service: String) {
        let proj = projects.first(where: { $0.name == project })
        let running = (proj?.running ?? false)
            && (proj?.services.contains(where: { $0.name == service }) ?? false)
        let desired = !running
        pendingServiceToggle[project, default: [:]][service] = desired
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            if self?.pendingServiceToggle[project]?[service] == desired {
                self?.pendingServiceToggle[project]?[service] = nil
            }
        }
        client?.toggleService(project, service: service)
    }
    func loadTerminals(_ project: String) { client?.requestTerminals(project: project) }

    func loadAutomations() { client?.requestJobs() }

    /// Load the agent-usage stats for a period (1/7/30 days, 0 = all time). Marks
    /// the screen active so a reconnect re-issues the query, and dims-not-blanks
    /// while reloading (the view keeps showing the prior snapshot).
    func loadStats(days: Int) {
        statsActive = true
        statsDays = days
        statsLoading = true
        statsError = nil
        client?.requestStats(days: days)
        // The scan replies asynchronously; if it never does (an old Mac that doesn't
        // know this message, or a reply lost while the socket stayed up), give up so
        // the screen shows an error instead of an endless skeleton. Keep prior data
        // on a reload timeout — only the first, dataless load surfaces the error.
        statsTimeout.arm("stats", seconds: 30) { [weak self] in
            guard let self, self.statsLoading else { return }
            self.statsLoading = false
            if self.stats == nil { self.statsError = "Couldn't load stats. Pull to refresh." }
        }
    }

    /// Pull-to-refresh on the Stats screen: re-request when live, else reconnect.
    func refreshStats() async {
        if case .ready = connection { loadStats(days: statsDays) }
        else { reconnectIfNeeded() }
        try? await Task.sleep(nanoseconds: 500_000_000)
    }

    /// The Stats screen closed: stop treating its query as live so a straggler
    /// reply (or reconnect) doesn't keep refetching in the background.
    func statsScreenDidClose() { statsActive = false }

    func refreshAutomations() async {
        if case .ready = connection { client?.requestJobs() }
        else { reconnectIfNeeded() }
        try? await Task.sleep(nanoseconds: 500_000_000)
    }

    func loadAutomationHistory(project: String, jobId: String) {
        let key = automationKey(project, jobId)
        automationHistoryLoading.insert(key)
        client?.requestJobHistory(project: project, jobId: jobId)
    }

    func loadAutomationLiveOutput(project: String, jobId: String) {
        client?.requestJobLiveOutput(project: project, jobId: jobId)
    }

    func runAutomation(project: String, jobId: String) {
        let key = automationKey(project, jobId)
        automationPending.insert(key)
        client?.runJob(project: project, jobId: jobId)
    }

    func stopAutomation(project: String, jobId: String) {
        let key = automationKey(project, jobId)
        automationPending.insert(key)
        client?.stopJob(project: project, jobId: jobId)
    }

    func setAutomationEnabled(project: String, jobId: String, enabled: Bool) {
        let key = automationKey(project, jobId)
        automationPending.insert(key)
        client?.setJobEnabled(project: project, jobId: jobId, enabled: enabled)
    }

    func sendAutomationFollowup(project: String, jobId: String, at: Int, message: String,
                                agent: String, model: String, effort: String) {
        let key = automationKey(project, jobId)
        automationPending.insert(key)
        automationFollowupError[key] = nil
        client?.sendJobFollowup(project: project, jobId: jobId, at: at, message: message,
                                agent: agent, model: model, effort: effort)
    }

    func automationKey(_ project: String, _ jobId: String) -> String { project + "\n" + jobId }

    /// Fetch a job's raw config body so the editor sheet can seed an edit.
    func loadJobConfig(project: String, jobId: String, source: String) {
        jobConfigLoadingKey = automationKey(project, jobId)
        jobConfigBody = nil
        jobConfigError = nil
        client?.requestJobConfig(project: project, jobId: jobId, source: source)
    }

    /// Create (empty `id`) or overwrite a job. `job` is the full YAML body the
    /// editor built; the reply bumps `jobMutationDoneToken` (dismiss) or sets
    /// `jobMutationError`. A timeout surfaces an error if the Mac stays silent.
    func saveJob(id: String, source: String, project: String, job: [String: Any]) {
        jobMutationInFlight = true
        jobMutationError = nil
        client?.saveJob(id: id, source: source, project: project, job: job)
        armJobMutationTimeout()
    }

    func deleteJob(id: String, source: String, project: String, deleteCopies: Bool) {
        jobMutationInFlight = true
        jobMutationError = nil
        client?.deleteJob(id: id, source: source, project: project, deleteCopies: deleteCopies)
        armJobMutationTimeout()
    }

    private func armJobMutationTimeout() {
        jobMutationTimeout.arm("job", seconds: 20) { [weak self] in
            guard let self, self.jobMutationInFlight else { return }
            self.jobMutationInFlight = false
            self.jobMutationError = "The Mac didn't respond. Try again."
        }
    }

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

    func runAction(_ project: String, action: String,
                   inputValues: [String: String] = [:], confirmed: Bool = false,
                   onSpawn: ((TerminalInfo) -> Void)? = nil) {
        client?.runAction(project: project, action: action, inputValues: inputValues, confirmed: confirmed)
        markTerminalCreating(project)
        spawnCallbacks[project] = onSpawn
        reloadTerminalsSoon(project)
    }

    /// Start a non-terminal action headlessly on the Mac and return its runId. The
    /// run streams into the Mac's background registry; poll `loadBackgroundRunOutput`
    /// for its live output + status.
    func startBackgroundAction(project: String, action: String, label: String,
                               inputValues: [String: String]) -> String {
        let runId = UUID().uuidString
        backgroundRunInfo[runId] = BackgroundRunInfo(
            runId: runId, project: project, label: label,
            startedAt: Int(Date().timeIntervalSince1970))
        backgroundRunErrors[runId] = nil
        client?.runActionBackground(project: project, action: action,
                                    inputValues: inputValues, runId: runId)
        return runId
    }
    func loadBackgroundRunOutput(project: String, runId: String) {
        client?.requestActionBgOutput(project: project, runId: runId)
    }
    func cancelBackgroundRun(_ runId: String) {
        client?.cancelActionBackground(runId: runId)
    }
    func loadBackgroundRuns(_ project: String) {
        client?.requestBackgroundRuns(project: project)
    }
    /// Background runs for a project, newest first — its own started runs plus any
    /// re-attached via `backgroundRuns` discovery.
    func backgroundRunList(for project: String) -> [BackgroundRunInfo] {
        backgroundRunInfo.values
            .filter { $0.project == project }
            .sorted { $0.startedAt > $1.startedAt }
    }

    /// Drop a run the Mac no longer knows, except: a run started <10s ago with no
    /// snapshot yet may simply not be registered there yet (the start message spawns
    /// a worker thread), and a failed-to-start run keeps its error visible.
    private func pruneBackgroundRun(_ runId: String) {
        if backgroundRunErrors[runId] != nil { return }
        if let info = backgroundRunInfo[runId], backgroundRuns[runId] == nil,
           Int(Date().timeIntervalSince1970) - info.startedAt < 10 {
            return
        }
        backgroundRunInfo[runId] = nil
        backgroundRuns[runId] = nil
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
        // A newer create intent invalidates any pending spawn-switch watcher.
        spawnCallbacks[project] = nil
        creatingBaseline[project] = Set(terminals[project]?.map(\.id) ?? [])
        creatingTerminals.insert(project)
        creatingTimeout.arm(project, seconds: 14) { [weak self] in
            guard let self else { return }
            self.creatingTerminals.remove(project)
            self.creatingBaseline[project] = nil
            self.spawnCallbacks[project] = nil
            self.loadTerminals(project)
        }
    }
    func closeTerminal(_ project: String, id: String) {
        closingTerminals[project, default: []].insert(id)
        terminals[project]?.removeAll { $0.id == id }
        // Drop the composer draft state for a terminal that's going away.
        composerStores[id] = nil
        client?.closeTerminal(project: project, id: id)
        closingTimeout.arm(id, seconds: 10) { [weak self] in
            guard let self, self.closingTerminals[project]?.contains(id) == true else { return }
            self.closingTerminals[project]?.remove(id)
            self.loadTerminals(project)
        }
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
    func loadMentions(_ project: String) { client?.requestMentions(project: project) }
    func loadHistory(_ project: String, q: String = "") { client?.requestHistory(project: project, q: q) }
    func recordHistory(project: String, id: String, label: String, text: String) {
        client?.recordHistory(project: project, id: id, label: label, text: text)
    }

    // MARK: composer parity

    /// The retained composer store for a terminal, created on first access. Holds
    /// the terminal's prompt tabs, attachments, and in-flight rewrite state so they
    /// survive leaving and re-entering the terminal screen.
    func composerStore(for id: String, project: String, label: String) -> ComposerStore {
        if let s = composerStores[id] { return s }
        let s = ComposerStore(termId: id, project: project, label: label, model: self)
        composerStores[id] = s
        return s
    }

    func loadComposerActions() { client?.requestComposerActions() }

    /// Upload an attachment blob tagged with a per-upload `reqId` the server echoes;
    /// `name` saves it under its original basename (files).
    func sendUpload(_ id: String, b64: String, mime: String, name: String?, reqId: String) {
        client?.uploadBlob(id, b64, mime: mime, name: name, reqId: reqId)
    }

    /// Drop the transform route for a reqId (on cancel/timeout, so it can't leak).
    func clearTransformRoute(_ reqId: String?) {
        if let reqId { transformRoutes[reqId] = nil }
    }

    /// Kick off an AI rewrite; returns the reqId the store keeps to match replies.
    func runTransform(termId: String, project: String, instruction: String,
                      text: String, variants: Int) -> String {
        let reqId = UUID().uuidString
        transformRoutes[reqId] = termId
        client?.runTransform(reqId: reqId, project: project, instruction: instruction,
                             text: text, variants: variants)
        return reqId
    }

    func loadServices(_ project: String) { client?.requestServices(project: project) }
    func serviceLogsKey(_ project: String, _ paneIndex: Int) -> String { project + "\n" + String(paneIndex) }
    func fetchServiceLogs(_ project: String, paneIndex: Int, lines: Int = 200) {
        client?.requestServiceLogs(project: project, paneIndex: paneIndex, lines: lines)
    }
    func consumeServiceLogs(_ key: String) {
        serviceLogsResult[key] = nil
        serviceLogsError[key] = nil
    }

    /// Capture the phone's own xterm scrollback for the "terminal output" mention
    /// (returns empty when the web view isn't registered yet).
    func captureTerminalOutput(_ id: String, lines: Int, _ done: @escaping (String) -> Void) {
        guard let fn = terminalCapture[id] else { done(""); return }
        fn(lines, done)
    }

    // History screen (paged historyQuery).

    func loadHistoryFirst(project: String?, search: String?, favoritesOnly: Bool, folder: String?) {
        historyActive = true
        historyLoading = true
        historyLoadingMore = false
        historyQueryParams = (project, search, favoritesOnly, folder)
        historyReqGen += 1
        historyPending.append((historyReqGen, false))
        client?.requestHistoryQuery(project: project, search: search,
                                    favoritesOnly: favoritesOnly, folder: folder, before: nil)
    }
    /// The history screen closed: stop treating its query as live and clear any
    /// in-flight paging bookkeeping so a straggler reply can't spin it.
    func historyScreenDidClose() {
        historyActive = false
        historyPending = []
        historyLoading = false
        historyLoadingMore = false
    }

    /// Shared "the socket was replaced" cleanup: fail every in-flight upload (so a
    /// lost reply can't leave a chip stuck uploading and Send blocked), and reset
    /// the history paging queue (so one lost reply can't wedge it off-by-one),
    /// re-issuing the open history query fresh. Runs on any teardown of a live link;
    /// requests it issues queue on the client and flush on reconnect.
    private func handleConnectionReset() {
        for store in composerStores.values { store.failInFlightUploads() }
        automationPending = []
        automationHistoryLoading = []
        // A stats scan in flight can't survive the reconnect; re-issue it if the
        // screen is still open, otherwise just drop the spinner.
        if statsActive { loadStats(days: statsDays) }
        else { statsLoading = false }
        historyPending = []
        historyLoadingMore = false
        if historyActive {
            let p = historyQueryParams
            loadHistoryFirst(project: p.project, search: p.search,
                             favoritesOnly: p.favoritesOnly, folder: p.folder)
        } else {
            historyLoading = false
        }
    }
    func loadHistoryMore() {
        guard historyHasMore, !historyLoading, !historyLoadingMore, let last = historyItems.last else { return }
        historyLoadingMore = true
        historyReqGen += 1
        historyPending.append((historyReqGen, true))
        let p = historyQueryParams
        client?.requestHistoryQuery(project: p.project, search: p.search,
                                    favoritesOnly: p.favoritesOnly, folder: p.folder,
                                    before: (last.at, last.seq))
    }
    func loadHistoryFolders() { client?.requestHistoryFolders() }
    func historySaveDraft(message: String, project: String?, id: String?, label: String?) {
        client?.historySaveDraft(message: message, project: project, id: id, label: label, images: nil)
    }
    func historyToggleFavorite(_ id: String) {
        if let i = historyItems.firstIndex(where: { $0.id == id }) {
            let nowFavorite = !historyItems[i].favorite
            historyItems[i].favorite = nowFavorite
            // Unfavoriting while viewing the Favorites collection drops the row.
            if historyQueryParams.favoritesOnly && !nowFavorite { historyItems.remove(at: i) }
        }
        client?.historyToggleFavorite(id: id)
    }
    func historyDelete(_ id: String) {
        historyItems.removeAll { $0.id == id }
        client?.historyDelete(id: id)
    }
    func historySetFolder(_ id: String, folder: String?) {
        if let i = historyItems.firstIndex(where: { $0.id == id }) {
            historyItems[i].folder = folder
            // Moving a message out of the folder being viewed drops the row.
            if let viewing = historyQueryParams.folder, folder != viewing { historyItems.remove(at: i) }
        }
        client?.historySetFolder(id: id, folder: folder)
    }
    func historyCreateFolder(_ name: String) { client?.historyCreateFolder(name: name) }
    func historyDeleteFolder(_ id: String) {
        historyFolders.removeAll { $0.id == id }
        client?.historyDeleteFolder(id: id, name: nil)
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

    /// Foreground backstop for notification withdrawal: iOS drops background clear
    /// pushes for suspended/force-quit apps, so after each projects refresh we prune
    /// delivered notifications whose status entry no longer exists. Only touches
    /// notifications for a project that's in this list (leaving unknown projects and
    /// just-arrived alerts whose status hasn't synced yet alone) and only when the
    /// project's live status keys no longer include the notification's key.
    private func reconcileNotifications(_ projects: [Project]) {
        var liveKeys: [String: Set<String>] = [:]
        for project in projects {
            liveKeys[project.name] = Set(project.statusEntries.map(\.key))
        }
        // This projects list belongs to the active Mac, so it may only prune that
        // Mac's notifications. A notification with a serverId is pruned only when it
        // matches the active record's serverId; one without a serverId (pre-upgrade,
        // or posted by an old Mac) is always eligible. When the active record has no
        // serverId yet, only serverId-less notifications may be pruned.
        let activeServerId = activeRecord?.serverId
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { delivered in
            let stale = delivered.compactMap { note -> String? in
                let info = note.request.content.userInfo
                guard let project = info["project"] as? String,
                      let key = info["statusKey"] as? String,
                      let keys = liveKeys[project], !keys.contains(key)
                else { return nil }
                if let noteServerId = info["serverId"] as? String, !noteServerId.isEmpty,
                   noteServerId != activeServerId {
                    return nil
                }
                return note.request.identifier
            }
            if !stale.isEmpty { center.removeDeliveredNotifications(withIdentifiers: stale) }
        }
    }

    private func wire(_ c: LpmClient) {
        wireConnection(c)
        wireProjects(c)
        wireStats(c)
        wireTerminals(c)
        wireAutomations(c)
        wireProjectEvents(c)
        wireTerminalStreams(c)
        wireGit(c)
        wireComposer(c)
        wireBackground(c)
        wireHistory(c)
    }

    private func wireConnection(_ c: LpmClient) {
        c.onState = { [weak self] s in
            guard let self else { return }
            self.connection = self.userFacing(s)
            self.repickHostIfStale(s, from: c)
            self.startRecoveryIfStale(s, from: c)
            let nowReady: Bool = { if case .ready = s { return true }; return false }()
            // The live socket dropped: any request awaiting a reply is now dead
            // (the reply can't survive the reconnect). Reset in-flight bookkeeping.
            if self.wasReady && !nowReady { self.handleConnectionReset() }
            self.wasReady = nowReady
            if nowReady {
                // The link is back — a recovery browse (if any) has done its job.
                self.stopBrowsing()
                self.recoveryStatus = nil
                c.requestProjects()
                c.requestSidebar()
                c.requestDuplicateDefaults()
                c.requestJobs()
                self.requestPushRegistration()
                self.sendApnsTokenIfPossible()
            }
        }
        c.onPaired = { [weak self] deviceId, token, serverId, serverName in
            self?.handlePaired(deviceId: deviceId, token: token, serverId: serverId, serverName: serverName)
        }
        c.onIdentity = { [weak self] serverId, serverName in
            self?.learnIdentity(serverId: serverId, serverName: serverName)
        }
        c.onApnsToken = { ok in
            if !ok { print("apns: server rejected token registration") }
        }
    }

    private func wireProjects(_ c: LpmClient) {
        c.onProjects = { [weak self] p in
            guard let self else { return }
            self.projects = p
            self.projectsLoaded = true
            for proj in p where self.pendingRun[proj.name] == proj.running {
                self.pendingRun[proj.name] = nil
            }
            for proj in p {
                guard let pending = self.pendingServiceToggle[proj.name], !pending.isEmpty else { continue }
                let runningNow = proj.running ? Set(proj.services.map(\.name)) : []
                for (svc, desired) in pending where runningNow.contains(svc) == desired {
                    self.pendingServiceToggle[proj.name]?[svc] = nil
                }
            }
            self.reconcileNotifications(p)
        }
        c.onSidebar = { [weak self] order, groups in
            self?.sidebarOrder = order
            self?.groups = groups
        }
        // A sidebar folder mutation reply carries the updated layout so the phone
        // re-renders in place; a failure surfaces once.
        c.onSidebarMutation = { [weak self] order, groups, error in
            guard let self else { return }
            if let error { self.actionError = error }
            else { self.sidebarOrder = order; self.groups = groups }
        }
        // Rename succeeded silently (the projects-changed push refreshes the label);
        // only a failure needs surfacing.
        c.onRenameProject = { [weak self] _, error in
            if let error { self?.actionError = error }
        }
        c.onFile = { [weak self] project, path, content, truncated, error in
            guard let self else { return }
            self.loadedFiles[project + "\n" + path] =
                FileLoad(content: content, truncated: truncated, error: error, loading: false)
        }
    }

    private func wireStats(_ c: LpmClient) {
        c.onStats = { [weak self] stats, error in
            guard let self else { return }
            if let stats {
                // Drop a stale reply from a superseded period — the payload echoes the
                // period it was scanned for, and only the current one may land.
                guard stats.days == self.statsDays else { return }
                self.statsTimeout.cancel("stats")
                self.stats = stats
                self.statsError = nil
                self.statsLoading = false
            } else {
                self.statsTimeout.cancel("stats")
                self.statsLoading = false
                self.statsError = error ?? "Couldn't load stats."
            }
        }
    }

    private func wireTerminals(_ c: LpmClient) {
        c.onTerminals = { [weak self] proj, t in
            guard let self else { return }
            var list = t
            if var closing = self.closingTerminals[proj] {
                // Ids no longer in the list are confirmed closed; the rest are
                // still in flight and stay hidden.
                closing.formIntersection(t.map(\.id))
                self.closingTerminals[proj] = closing.isEmpty ? nil : closing
                list.removeAll { closing.contains($0.id) }
            }
            self.terminals[proj] = list
            if let base = self.creatingBaseline[proj], list.contains(where: { !base.contains($0.id) }) {
                let fresh = list.first(where: { !base.contains($0.id) })
                self.creatingBaseline[proj] = nil
                self.creatingTerminals.remove(proj)
                if let cb = self.spawnCallbacks[proj], let fresh {
                    cb(fresh)
                    self.spawnCallbacks[proj] = nil
                }
            }
        }
        c.onSlash = { [weak self] id, cmds in self?.slashCommands[id] = cmds }
        c.onUpload = { [weak self] id, reqId, path in
            self?.composerStores[id]?.resolveUpload(reqId: reqId, path: path)
        }
        c.onMentions = { [weak self] proj, entries in self?.mentions[proj] = entries }
        c.onHistory = { [weak self] proj, rows in self?.history[proj] = rows.filter { !$0.isDraft } }
    }

    private func wireAutomations(_ c: LpmClient) {
        c.onJobs = { [weak self] jobs, error in
            guard let self else { return }
            self.automationsLoaded = true
            if let error { self.automationError = error }
            else { self.automations = jobs }
        }
        c.onJobHistory = { [weak self] project, jobId, entries, error in
            guard let self else { return }
            let key = self.automationKey(project, jobId)
            self.automationHistoryLoading.remove(key)
            if error == nil { self.automationHistory[key] = entries }
            else { self.automationError = error }
        }
        c.onJobLiveOutput = { [weak self] project, jobId, live, error in
            guard let self else { return }
            let key = self.automationKey(project, jobId)
            if let live { self.automationLiveOutput[key] = live }
            else { self.automationLiveOutput[key] = nil }
            if let error { self.automationError = error }
        }
        c.onAutomationMutation = { [weak self] project, jobId, error in
            guard let self else { return }
            let key = self.automationKey(project, jobId)
            self.automationPending.remove(key)
            if let error { self.automationError = error }
            c.requestJobs()
            if self.automationHistory[key] != nil {
                c.requestJobHistory(project: project, jobId: jobId)
            }
        }
        c.onAutomationFollowup = { [weak self] project, jobId, error in
            guard let self else { return }
            let key = self.automationKey(project, jobId)
            self.automationPending.remove(key)
            if let error { self.automationFollowupError[key] = error }
            c.requestJobs()
            c.requestJobHistory(project: project, jobId: jobId)
            c.requestJobLiveOutput(project: project, jobId: jobId)
        }
        c.onJobConfig = { [weak self] project, jobId, job, error in
            guard let self else { return }
            self.jobConfigLoadingKey = nil
            if let error { self.jobConfigError = error }
            else { self.jobConfigBody = job }
        }
        c.onJobSaved = { [weak self] _, error in
            guard let self else { return }
            self.jobMutationTimeout.cancel("job")
            self.jobMutationInFlight = false
            if let error { self.jobMutationError = error }
            else {
                self.jobMutationDoneToken += 1
                c.requestJobs()
            }
        }
        c.onJobDeleted = { [weak self] _, error in
            guard let self else { return }
            self.jobMutationTimeout.cancel("job")
            self.jobMutationInFlight = false
            if let error { self.jobMutationError = error }
            else {
                self.jobMutationDoneToken += 1
                c.requestJobs()
            }
        }
        c.onJobsChanged = { [weak self] in
            guard let self else { return }
            c.requestJobs()
            for key in self.automationHistory.keys {
                let parts = key.split(separator: "\n", maxSplits: 1).map(String.init)
                if parts.count == 2 { c.requestJobHistory(project: parts[0], jobId: parts[1]) }
            }
        }
    }

    private func wireProjectEvents(_ c: LpmClient) {
        c.onProjectsChanged = {
            c.requestProjects()
            c.requestSidebar()
            c.requestJobs()
        }
        c.onStatusChanged = { proj in c.requestStatus(project: proj) }
        c.onActionError = { [weak self] message in self?.actionError = message }
        c.onSendQueueFull = { [weak self] in self?.actionError = "Not connected — action not sent." }
        c.onActionFailed = { [weak self] proj, message in
            guard let self else { return }
            self.creatingBaseline[proj] = nil
            self.creatingTerminals.remove(proj)
            self.spawnCallbacks[proj] = nil
            self.actionError = message
        }
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
    }

    private func wireTerminalStreams(_ c: LpmClient) {
        c.onSeed = { [weak self] id, cols, rows, data in self?.onTerminalSeed[id]?(cols, rows, data) }
        c.onOutput = { [weak self] id, data in self?.onTerminalOutput[id]?(data) }
        c.onControl = { [weak self] id, owner in self?.setControlOwner(id, owner) }
    }

    private func wireGit(_ c: LpmClient) {
        c.onGit = { [weak self] project, snapshot, error in
            self?.git.applySnapshot(project, snapshot, error: error)
        }
        c.onGitDiff = { [weak self] project, path, result, error in
            self?.git.applyDiff(project, path: path, result: result, error: error)
        }
        c.onGitDiffs = { [weak self] project, entries, error in
            // A whole-batch failure is project-resolution only (unreachable once a
            // project's snapshot has loaded); the per-key timeouts clear the spinners.
            guard let self, error == nil else { return }
            for e in entries {
                self.git.applyDiff(project, path: e.path, result: e.result, error: e.error)
            }
        }
        c.onGitCommit = { [weak self] project, error in self?.git.finishCommit(project, error: error) }
        c.onGitPush = { [weak self] project, error in self?.git.finishPush(project, error: error) }
        c.onGitGenMessage = { [weak self] project, message, error in
            self?.git.finishGenMessage(project, message: message, error: error)
        }
        c.onGitGenPr = { [weak self] project, title, body, error in
            self?.git.finishGenPr(project, title: title, body: body, error: error)
        }
        c.onGitCreatePr = { [weak self] project, url, error in
            self?.git.finishCreatePr(project, url: url, error: error)
        }
        c.onGitPull = { [weak self] project, error in self?.git.finishPull(project, error: error) }
        c.onGitFetch = { [weak self] project, error in self?.git.finishFetch(project, error: error) }
        c.onGitDiscardAll = { [weak self] project, error in self?.git.finishDiscard(project, error: error) }
        c.onGitChanged = { [weak self] project in self?.git.changed(project) }
        c.onGitBranches = { [weak self] project, current, branches, error in
            self?.git.applyBranches(project, current: current, branches: branches, error: error)
        }
        c.onGitCheckout = { [weak self] project, error in self?.git.finishCheckout(project, error: error) }
        c.onGitCreateBranch = { [weak self] project, error in self?.git.finishCreateBranch(project, error: error) }
    }

    private func wireComposer(_ c: LpmClient) {
        c.onComposerActions = { [weak self] actions in self?.composerActions = actions }
        c.onTransformVariant = { [weak self] reqId, idx, text, error in
            guard let self, let termId = self.transformRoutes[reqId] else { return }
            self.composerStores[termId]?.receiveTransformVariant(reqId: reqId, idx: idx, text: text, error: error)
        }
        c.onTransformDone = { [weak self] reqId, ok in
            guard let self else { return }
            let termId = self.transformRoutes[reqId]
            self.transformRoutes[reqId] = nil
            if let termId { self.composerStores[termId]?.finishTransform(reqId: reqId, ok: ok) }
        }
        c.onServices = { [weak self] project, running, services, error in
            guard let self, error == nil else { return }
            self.services[project] = services
            self.servicesRunning[project] = running
        }
        c.onServiceLogs = { [weak self] project, pane, text, error in
            guard let self else { return }
            let key = self.serviceLogsKey(project, pane)
            if let text { self.serviceLogsResult[key] = text; self.serviceLogsError[key] = nil }
            else { self.serviceLogsError[key] = error ?? "Couldn't read the logs." }
        }
    }

    private func wireBackground(_ c: LpmClient) {
        c.onActionBgOutput = { [weak self] runId, snapshot in
            guard let self else { return }
            guard let snapshot else {
                // found:false — the run was reaped on the Mac (or never existed).
                // Keeping stale state would leave the row spinning on "Running" and
                // re-polled forever, so drop the run. A just-started run whose first
                // poll raced the Mac-side registration gets a grace window instead.
                self.pruneBackgroundRun(runId)
                return
            }
            self.backgroundRuns[runId] = snapshot
            if self.backgroundRunInfo[runId] == nil {
                self.backgroundRunInfo[runId] = BackgroundRunInfo(
                    runId: runId, project: snapshot.project, label: snapshot.label,
                    startedAt: snapshot.startedAt)
            }
        }
        c.onActionBgStartFailed = { [weak self] runId, error in
            self?.backgroundRunErrors[runId] = error
        }
        c.onBackgroundRuns = { [weak self] project, runs in
            guard let self else { return }
            // The Mac's list is authoritative (running + finished within the TTL):
            // anything of ours it no longer carries has been reaped, so prune it —
            // this also bounds the section across a long session.
            let listed = Set(runs.map(\.runId))
            for (id, info) in self.backgroundRunInfo
            where info.project == project && !listed.contains(id) {
                self.pruneBackgroundRun(id)
            }
            for r in runs where self.backgroundRunInfo[r.runId] == nil {
                self.backgroundRunInfo[r.runId] = BackgroundRunInfo(
                    runId: r.runId, project: project, label: r.label, startedAt: r.startedAt)
            }
        }
    }

    private func wireHistory(_ c: LpmClient) {
        c.onHistoryQuery = { [weak self] items, hasMore in
            guard let self, !self.historyPending.isEmpty else { return }
            let req = self.historyPending.removeFirst()
            // Only the newest in-flight request may mutate the list; a stale reply
            // from a superseded filter/search is dropped (its loading flags are
            // cleared by the newest reply, which arrives after it in order).
            guard req.gen == self.historyReqGen else { return }
            if req.paging { self.historyItems.append(contentsOf: items) }
            else { self.historyItems = items }
            self.historyHasMore = hasMore
            self.historyLoading = false
            self.historyLoadingMore = false
        }
        c.onHistorySaveDraft = { _ in }
        c.onHistoryToggleFavorite = { [weak self] id, favorite, error in
            guard let self, error == nil else { return }
            if let i = self.historyItems.firstIndex(where: { $0.id == id }), self.historyItems[i].favorite != favorite {
                self.historyItems[i].favorite = favorite
            }
        }
        c.onHistoryMutated = { [weak self] _, _ in self?.client?.requestHistoryFolders() }
        c.onHistoryFolders = { [weak self] folders in self?.historyFolders = folders }
        c.onHistoryCreateFolder = { [weak self] folder, _ in
            guard let self, let folder else { return }
            if !self.historyFolders.contains(where: { $0.id == folder.id }) {
                self.historyFolders.append(folder)
                self.historyFolders.sort { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            }
        }
    }
}

/// A generated pull-request draft (title + body), filled into the PR sheet's
/// editable fields.
struct GitPrDraft: Equatable {
    var title: String
    var body: String
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

private extension String {
    /// The string trimmed of surrounding whitespace, or nil if that leaves nothing —
    /// so an empty/blank `serverName` never overwrites a real record name.
    var trimmedNonEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}
