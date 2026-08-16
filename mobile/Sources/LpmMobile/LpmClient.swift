import Foundation
import CryptoKit

/// A single WebSocket connection to a paired Mac. Owns connect/auth/reconnect
/// and demultiplexes inbound frames to per-terminal streams and control state.
///
/// iOS suspends the app (and kills this socket) seconds after backgrounding, so
/// `connect()` is idempotent and safe to call again on foreground; each connect
/// re-authenticates and re-subscribes, and the server's `seed` frame restores
/// the current screen from its ring buffer.
final class LpmClient: NSObject {
    enum State: Equatable { case idle, connecting, ready, failed(String) }

    struct Endpoint {
        var host: String
        var port: Int
        var url: URL? { WssURL.make(host: host, port: port) }
    }

    // Callbacks are delivered on the main queue.
    var onState: ((State) -> Void)?
    var onOutput: ((_ id: String, _ data: String) -> Void)?
    var onSeed: ((_ id: String, _ cols: Int, _ rows: Int, _ data: String, _ reset: Bool) -> Void)?
    var onControl: ((_ id: String, _ owner: ControlOwner?) -> Void)?
    var onExit: ((_ id: String, _ code: Int) -> Void)?
    var onProjects: (([Project]) -> Void)?
    var onSidebar: ((_ order: [String], _ groups: [ProjectFolder]) -> Void)?
    var onStats: ((_ stats: AgentStats?, _ error: String?) -> Void)?
    var onLimits: ((_ snapshot: LimitsSnapshot?, _ error: String?) -> Void)?
    var onLimitsChanged: ((_ snapshot: LimitsSnapshot) -> Void)?
    var onSpeech: ((_ reqId: String, _ audio: String?, _ error: String?) -> Void)?
    var onTerminals: ((_ project: String, _ terminals: [TerminalInfo]) -> Void)?
    var onSlash: ((_ id: String, _ commands: [SlashCommand]) -> Void)?
    var onUpload: ((_ id: String, _ reqId: String, _ path: String) -> Void)?
    var onMentions: ((_ project: String, _ entries: [MentionEntry]) -> Void)?
    var onHistory: ((_ project: String, _ rows: [HistoryRow]) -> Void)?
    var onStatus: ((_ project: String, _ entries: [StatusEntry]) -> Void)?
    var onJobs: ((_ jobs: [AutomationJob], _ error: String?) -> Void)?
    var onJobHistory: ((_ project: String, _ jobId: String, _ entries: [AutomationHistoryEntry], _ error: String?) -> Void)?
    var onJobLiveOutput: ((_ project: String, _ jobId: String, _ live: AutomationLiveOutput?, _ error: String?) -> Void)?
    var onAutomationMutation: ((_ project: String, _ jobId: String, _ error: String?) -> Void)?
    var onAutomationFollowup: ((_ project: String, _ jobId: String, _ error: String?) -> Void)?
    var onJobConfig: ((_ project: String, _ jobId: String, _ job: [String: Any]?, _ error: String?) -> Void)?
    var onJobSaved: ((_ id: String, _ error: String?) -> Void)?
    var onJobDeleted: ((_ id: String, _ error: String?) -> Void)?
    var onJobsChanged: (() -> Void)?
    var onDuplicateDefaults: ((_ excludeUncommitted: Bool, _ reinstallDeps: Bool, _ pullLatest: Bool) -> Void)?
    var onDuplicateProgress: ((_ done: Int, _ total: Int, _ name: String) -> Void)?
    var onDuplicateDone: ((_ error: String?, _ warning: String?) -> Void)?
    var onProjectsChanged: (() -> Void)?
    var onStatusChanged: ((_ project: String) -> Void)?
    // A duplicate/remove failed — the message to surface. Success is silent (the
    // `projects-changed` push refreshes the list on its own).
    var onActionError: ((_ message: String) -> Void)?
    // The offline send queue is full, so a new request was dropped rather than
    // silently evicting an older queued one.
    var onSendQueueFull: (() -> Void)?
    // A runAction/newTerminal the Mac couldn't execute — stop the creating
    // placeholder for the project and surface the message.
    var onActionFailed: ((_ project: String, _ message: String) -> Void)?
    // Git review replies, one callback per request kind. `error` is nil on
    // success; a nil `snapshot` means the `git` request hard-failed.
    var onGit: ((_ project: String, _ snapshot: GitSnapshot?, _ error: String?) -> Void)?
    var onGitDiff: ((_ project: String, _ path: String, _ result: GitDiffResult?, _ error: String?) -> Void)?
    var onGitDiffs: ((_ project: String, _ entries: [GitDiffEntry], _ error: String?) -> Void)?
    var onGitCommit: ((_ project: String, _ error: String?) -> Void)?
    var onGitPush: ((_ project: String, _ error: String?) -> Void)?
    var onGitGenMessage: ((_ project: String, _ message: String?, _ error: String?) -> Void)?
    var onGitGenPr: ((_ project: String, _ title: String?, _ body: String?, _ error: String?) -> Void)?
    var onGitCreatePr: ((_ project: String, _ url: String?, _ error: String?) -> Void)?
    var onGitPull: ((_ project: String, _ error: String?) -> Void)?
    var onGitFetch: ((_ project: String, _ error: String?) -> Void)?
    var onGitBranches: ((_ project: String, _ current: String, _ branches: [GitBranch], _ error: String?) -> Void)?
    var onGitCheckout: ((_ project: String, _ error: String?) -> Void)?
    var onGitDiscardAll: ((_ project: String, _ error: String?) -> Void)?
    var onGitChanged: ((_ project: String) -> Void)?
    // A fresh pairing succeeded: the new credential plus the Mac's advertised
    // identity. The model persists the credential (per-Mac Keychain) and creates
    // or dedupes the saved-Mac record. serverId/serverName are absent on older
    // Macs; `hosts` is the Mac's current candidate address list (empty on older Macs).
    var onPaired: ((_ deviceId: String, _ token: String, _ serverId: String?, _ serverName: String?, _ hosts: [String]) -> Void)?
    // Approve-on-Mac pairing: the request was accepted (dialog up on the Mac,
    // carrying the match code to display), or refused with a reason.
    var onPairPending: ((_ matchCode: String) -> Void)?
    var onPairDenied: ((_ reason: String) -> Void)?
    // A reconnect reached `ready` carrying the Mac's identity, so the active
    // record can learn/refresh its serverId and name. Absent on older Macs.
    var onIdentity: ((_ serverId: String?, _ serverName: String?) -> Void)?
    // A `ready` frame carried the Mac's current candidate address list. Keyed by
    // the frame's serverId — never the active record, which a pairing connection
    // hasn't been assigned to yet when `ready` lands.
    var onAdvertisedHosts: ((_ serverId: String?, _ hosts: [String]) -> Void)?
    // The desktop acknowledged (or rejected) an apnsToken registration.
    var onApnsToken: ((_ ok: Bool) -> Void)?
    // Composer parity replies.
    var onComposerActions: ((_ actions: [ComposerAction]) -> Void)?
    var onTransformVariant: ((_ reqId: String, _ idx: Int, _ text: String?, _ error: String?) -> Void)?
    var onTransformDone: ((_ reqId: String, _ ok: Bool) -> Void)?
    // A composer draft mirrored from the Mac. `isSeed` marks a draft carried by a
    // `seed` (restored on open/reconnect) so the store fills only an empty input.
    var onComposerDraft: ((_ id: String, _ text: String, _ rev: Int, _ origin: String, _ isSeed: Bool) -> Void)?
    var onServices: ((_ project: String, _ running: Bool, _ services: [ServiceInfo], _ error: String?) -> Void)?
    var onServiceLogs: ((_ project: String, _ paneIndex: Int, _ text: String?, _ error: String?) -> Void)?
    // A polled background-action snapshot (`snapshot` nil once reaped on the Mac),
    // a rejected start, and the project's background-run list for reconnect.
    var onActionBgOutput: ((_ runId: String, _ snapshot: ActionBgOutput?) -> Void)?
    var onActionBgStartFailed: ((_ runId: String, _ error: String) -> Void)?
    var onBackgroundRuns: ((_ project: String, _ runs: [BackgroundRunSummary]) -> Void)?
    var onHistoryQuery: ((_ items: [HistoryItem], _ hasMore: Bool) -> Void)?
    var onHistorySaveDraft: ((_ ok: Bool) -> Void)?
    var onHistoryToggleFavorite: ((_ id: String, _ favorite: Bool, _ error: String?) -> Void)?
    var onHistoryMutated: ((_ ok: Bool, _ error: String?) -> Void)?
    var onHistoryFolders: ((_ folders: [HistoryFolder]) -> Void)?
    var onHistoryCreateFolder: ((_ folder: HistoryFolder?, _ error: String?) -> Void)?
    // Rename a project's label (error nil on success). New git branch reply.
    var onRenameProject: ((_ project: String, _ error: String?) -> Void)?
    var onGitCreateBranch: ((_ project: String, _ error: String?) -> Void)?
    // A sidebar folder mutation settled: the updated layout (on success) plus any
    // error to surface. The reply carries the fresh order/groups so no follow-up
    // `sidebar` is needed.
    var onSidebarMutation: ((_ order: [String], _ groups: [ProjectFolder], _ error: String?) -> Void)?
    // A readFile reply: `content` nil on failure, `truncated` when capped.
    var onFile: ((_ project: String, _ path: String, _ content: String?, _ truncated: Bool, _ error: String?) -> Void)?
    // Project creation / discovery + config editing replies. Reads carry a decoded
    // payload (nil on failure); writes carry only the error to surface (nil = ok).
    var onListDirs: ((_ listing: DirListing?, _ error: String?) -> Void)?
    var onListSshHosts: ((_ hosts: [SshHostInfo], _ error: String?) -> Void)?
    var onCreateProject: ((_ name: String, _ error: String?) -> Void)?
    var onCreateSshProject: ((_ name: String, _ error: String?) -> Void)?
    var onCloneProject: ((_ name: String, _ error: String?) -> Void)?
    var onReadConfig: ((_ project: String, _ layer: String, _ content: String, _ available: Bool, _ error: String?) -> Void)?
    var onSaveConfig: ((_ project: String, _ layer: String, _ name: String, _ error: String?) -> Void)?
    var onServiceBody: ((_ project: String, _ key: String, _ body: [String: Any]?, _ source: String, _ error: String?) -> Void)?
    var onActionBody: ((_ project: String, _ key: String, _ body: [String: Any]?, _ section: String, _ source: String, _ error: String?) -> Void)?
    var onSaveService: ((_ project: String, _ key: String, _ error: String?) -> Void)?
    var onDeleteService: ((_ project: String, _ key: String, _ error: String?) -> Void)?
    var onSaveProfile: ((_ project: String, _ name: String, _ error: String?) -> Void)?
    var onDeleteProfile: ((_ project: String, _ name: String, _ error: String?) -> Void)?
    var onSaveAction: ((_ project: String, _ key: String, _ error: String?) -> Void)?
    var onDeleteAction: ((_ project: String, _ key: String, _ error: String?) -> Void)?
    // Session memory replies. `list`/`session` are nil on failure; `memoryChanged`
    // is the push carrying the OWNER folder name (a duplicate's original).
    var onMemory: ((_ project: String, _ list: MemoryList?, _ error: String?) -> Void)?
    var onMemorySession: ((_ project: String, _ name: String, _ session: MemorySession?, _ error: String?) -> Void)?
    var onMemorySave: ((_ project: String, _ name: String, _ error: String?) -> Void)?
    var onMemoryDelete: ((_ project: String, _ name: String, _ error: String?) -> Void)?
    var onMemoryChanged: ((_ project: String) -> Void)?
    // Notes replies, one per request kind. Each carries the keys its request was
    // addressed by, since the Mac answers these off worker threads (out of order).
    var onNotesChats: ((_ project: String, _ chats: [NoteChat], _ error: String?) -> Void)?
    var onNotesCreateChat: ((_ project: String, _ chat: NoteChat?, _ error: String?) -> Void)?
    var onNotesRenameChat: ((_ project: String, _ chatId: String, _ error: String?) -> Void)?
    var onNotesDeleteChat: ((_ project: String, _ chatId: String, _ error: String?) -> Void)?
    var onNotesMessages: ((_ project: String, _ chatId: String, _ beforeId: String, _ messages: [NoteMessage], _ error: String?) -> Void)?
    var onNotesAddMessage: ((_ project: String, _ chatId: String, _ message: NoteMessage?, _ error: String?) -> Void)?
    var onNotesEditMessage: ((_ project: String, _ id: String, _ error: String?) -> Void)?
    var onNotesDeleteMessage: ((_ project: String, _ id: String, _ error: String?) -> Void)?
    var onNotesSearch: ((_ project: String, _ query: String, _ hits: [NoteSearchHit], _ error: String?) -> Void)?
    var onNotesAttachment: ((_ project: String, _ hash: String, _ data: String?, _ error: String?) -> Void)?

    private var endpoint: Endpoint
    private var credential: Credential?
    private var pairingCode: String?
    // Non-nil while an approve-on-Mac pairing is in flight: the device name sent in
    // the first `pairRequest` frame. This mode never auto-retries (a retry would
    // pop a second Allow dialog) and never runs the connect watchdog (approval can
    // take longer than it); the pair guard below bounds it instead.
    private var pairRequestName: String?
    // Non-nil while re-pairing a Mac this phone already has a (now-rejected)
    // credential for: the device id the Mac should drop as it mints the new one,
    // sent as the optional `replaces` key on the pair/pairRequest frame. Older
    // Macs ignore the key and simply keep the dead record.
    private var replacesDeviceId: String?
    private var pairGuard: DispatchWorkItem?
    private let pairGuardTimeout: TimeInterval = 35
    private var deviceName: String
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var subscribed = Set<String>() // termIds we auto-re-sub on reconnect
    private var watchedProjects = Set<String>() // projects we auto-re-watch on reconnect
    // How far into each terminal's output stream this phone has applied, so a
    // re-subscribe (reconnect, unlock, dropped frames) asks for the missed slice
    // rather than a full screen replay — which resets the emulator and can only
    // approximate what a running full-screen program thinks it drew. Absent for a
    // terminal whose Mac doesn't stamp offsets (older desktop, demo mode), which
    // turns the tracking off for that terminal.
    private var streamOffset: [String: Int] = [:]
    // Terminals with a `sub` in flight. The reply carries everything the desktop
    // had queued for us when it answered, so output arriving before it is already
    // included and would otherwise apply twice; hold it until the seed lands. This
    // also collapses a burst of gap-triggered resyncs into a single request.
    private var awaitingSeed = Set<String>()
    private(set) var state: State = .idle

    // Requests made while the link is down or half-dead, delivered on the next
    // `ready`. iOS kills the socket seconds after backgrounding and the
    // heartbeat can take a while to notice, so the tap that comes right after
    // reopening the app (often the very send that exposes the dead socket)
    // would otherwise vanish silently. Live traffic (keystrokes, resizes,
    // subscriptions) is deliberately excluded: replaying stale input after a
    // reconnect is worse than dropping it, and subscriptions re-send on ready.
    private var pendingSends: [String] = []
    private let maxPendingSends = 32

    // Reconnection. Over a cellular Tailscale path the tunnel flaps (direct ↔
    // DERP), so a connection can establish and drop within seconds; the client
    // retries with exponential backoff instead of dying on the first failure.
    // `wantConnected` is true between connect() and disconnect()/logout and gates
    // every retry, so an intentional teardown never resurrects the socket.
    private var wantConnected = false
    private var retryAttempt = 0
    private var reconnectWork: DispatchWorkItem?
    private var connectWatchdog: DispatchWorkItem?
    private var heartbeat: DispatchSourceTimer?
    private var heartbeatDeadline: DispatchWorkItem?
    private var heartbeatArmedAt: Date?
    private var probeDeadline: DispatchWorkItem?
    private let connectTimeout: TimeInterval = 10
    private let heartbeatInterval: TimeInterval = 20
    // Lenient (Tailscale over cellular can have multi-second RTT), but far
    // shorter than the minutes a black-holed path leaves a ping completion
    // unfired.
    private let heartbeatPongTimeout: TimeInterval = 10
    // Queued work doesn't run while the app is suspended, so a pong deadline can
    // thaw arbitrarily late on resume with nothing wrong with the link. Overshoot
    // past this much is read as "we were suspended", not "the pong never came" —
    // a real dead link overshoots by milliseconds, not by 3x.
    private var heartbeatSuspendSlack: TimeInterval { heartbeatPongTimeout * 3 }
    private let probeTimeout: TimeInterval = 4
    private let baseBackoff: TimeInterval = 1.5
    private let maxBackoff: TimeInterval = 20
    // After a few quick retries fail, stop pretending and surface an honest error
    // (while still retrying underneath), so the UI never spins forever.
    private let patientAttempts = 3

    static let offlineHint = "Can't reach your Mac. On cellular, make sure Tailscale is connected on both devices."

    // Sentinel failure reasons for certificate-pinning aborts, mapped to
    // user-facing copy by the model. `identityChangedError` is a reconnect whose
    // cert no longer matches the stored pin; `pairMismatchError` is a QR pairing
    // whose cert didn't match the fingerprint the QR advertised.
    static let identityChangedError = "identity-changed"
    static let pairMismatchError = "pair-mismatch"

    // Sentinel hints for retryable failures where the Mac *did* answer, so the
    // generic "none of its addresses responded" would be misleading:
    // `secureFailedError` — TCP connected but the secure handshake failed (e.g.
    // the Mac's identity was reset, or mismatched app/Mac versions);
    // `refusedError` — the machine is reachable but nothing accepts on the port
    // (lpm not running, or a stale port after a dev/prod port change).
    static let secureFailedError = "secure-failed"
    static let refusedError = "connection-refused"

    // Sentinel `onPairDenied` reason for an address the phone can't even form a
    // URL from, alongside the wire reasons ("busy", "declined", "timeout"). Only
    // an approve-on-Mac pairing can reach it: code pairing probes its addresses
    // first, so an unusable one is already rejected there.
    static let badAddressReason = "bad-address"

    // Sentinel for the Mac rejecting this device's credential: it no longer holds
    // a paired record for this phone, so retrying the same credential can never
    // succeed. Mapped to user-facing copy by the model, which turns it into a
    // "pair again" prompt.
    static let unauthorizedError = "device-unauthorized"

    /// True for any of the retryable "offline" hints — the states the model's
    /// stale-host repick and mDNS recovery should react to, not just the generic
    /// unreachable one (a refused port is exactly what recovery can heal).
    static func isOfflineHint(_ msg: String) -> Bool {
        msg == offlineHint || msg == secureFailedError || msg == refusedError
    }

    // What the most recent transport failure looked like, refreshed on every
    // failed attempt and reported once retries stop being patient.
    private var failureHint = LpmClient.offlineHint

    /// The URLSession error code behind the most recent transport failure, for
    /// the model to append to the offline message — "secure connection failed"
    /// alone isn't enough to tell a refused certificate from a broken handshake
    /// when someone reports the screen.
    private(set) var lastTransportErrorCode: Int?

    /// The full nested error-code chain of the most recent transport failure
    /// (e.g. "-1200/-9816"): the deepest codes name the exact TLS failure, which
    /// the top-level URLSession code alone can't.
    private(set) var lastTransportErrorChain: String?

    /// Walks NSUnderlyingError to the deepest cause, joining the codes.
    private static func errorChain(_ error: Error?) -> String? {
        guard var e = error as NSError? else { return nil }
        var parts = ["\(e.code)"]
        while let u = e.userInfo[NSUnderlyingErrorKey] as? NSError {
            e = u
            parts.append("\(e.code)")
        }
        return parts.joined(separator: "/")
    }

    // The auth/pair frame for the current attempt, transmitted only once the
    // socket reports open (see startAttempt for why it can't be sent earlier).
    private var pendingHandshakeFrame: String?

    struct Credential { let deviceId: String; let token: String }

    /// This device's id (once paired/authenticated), for comparing against a
    /// terminal's control owner.
    var deviceId: String? { credential?.deviceId }

    // Trust evaluation for the wss:// link. Owns the pin comparison during the TLS
    // handshake and captures the observed leaf-cert fingerprint so the model can
    // pin it (TOFU) after auth succeeds. Held strongly here (and by the session);
    // its back-reference to us is weak, so no retain cycle keeps this client alive.
    private let pinning: PinningDelegate

    /// The leaf-cert fingerprint observed on this connection's TLS handshake, once
    /// it has completed. The model reads it after a `paired`/`ready` reply to pin it.
    var observedFingerprint: String? { pinning.observed }

    // Non-nil in offline Demo Mode: outbound frames route here instead of a socket,
    // and `connect()` injects a scripted `ready` instead of dialing (no URLSession,
    // no pinning, no reconnect loop). See DemoServer.
    private let demoServer: DemoServer?

    init(endpoint: Endpoint, credential: Credential?, deviceName: String,
         pinProvider: (() -> String?)? = nil, expectedFingerprint: String? = nil) {
        self.endpoint = endpoint
        self.credential = credential
        self.deviceName = deviceName
        self.demoServer = nil
        self.pinning = PinningDelegate(pinProvider: pinProvider, expected: expectedFingerprint)
        super.init()
        pinning.client = self
        let config = URLSessionConfiguration.default
        // Fail fast on a dead path rather than waiting for connectivity — the
        // reconnect loop owns retrying, and the watchdog owns the connect timeout.
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config, delegate: pinning, delegateQueue: nil)
    }

    /// Build a client backed by an in-process `DemoServer` (offline Demo Mode). No
    /// socket is ever opened; a pre-set demo credential (deviceId "demo-device")
    /// makes control-ownership comparisons work before the scripted `ready` lands.
    init(demoServer: DemoServer, deviceName: String) {
        self.endpoint = Endpoint(host: "demo", port: 0)
        self.credential = Credential(deviceId: DemoServer.deviceId, token: "demo")
        self.deviceName = deviceName
        self.demoServer = demoServer
        self.pinning = PinningDelegate(pinProvider: nil, expected: nil)
        super.init()
        demoServer.deliver = { [weak self] text in self?.injectInbound(text) }
    }

    /// Feed a server frame into the normal inbound path (Demo Mode only): parse it
    /// and dispatch on the main queue, exactly as `receiveLoop` does for a socket.
    func injectInbound(_ text: String) {
        let frame = Wire.Inbound.parse(text)
        main { [weak self] in self?.dispatch(frame) }
    }

    /// A certificate pin check failed during the TLS handshake. Turn it into a
    /// terminal failure (no silent retry onto a possibly-impersonated Mac); the
    /// model surfaces the mismatch and offers to trust the new identity.
    func notePinMismatch(pairing: Bool) {
        main { [weak self] in
            guard let self else { return }
            self.fatal(pairing ? Self.pairMismatchError : Self.identityChangedError)
        }
    }

    /// Connect (or reconnect) for a normal, already-paired session. Idempotent:
    /// resets backoff and starts a fresh attempt, which is what foregrounding
    /// wants (a clean chance rather than continuing a long backoff).
    func connect() {
        if demoServer != nil { return connectDemo() }
        wantConnected = true
        cancelReconnect()
        startAttempt()
    }

    /// Demo Mode "connect": no socket and no auth. After a short simulated handshake
    /// inject a protocol-correct `ready` frame through the normal inbound path, so
    /// `dispatch(.ready)` runs its usual effects (state→ready, re-sub, flushPending,
    /// onIdentity). Idempotent — a re-entrant connect while live is a no-op.
    private func connectDemo() {
        wantConnected = true
        if case .ready = state { return }
        set(.connecting)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self, self.demoServer != nil, self.wantConnected else { return }
            if case .ready = self.state { return }
            self.injectInbound(Wire.json([
                "t": "ready", "serverId": DemoServer.serverId, "serverName": DemoServer.serverName,
            ]))
        }
    }

    /// Connect to consume a one-time pairing code scanned from the desktop QR.
    /// `replaces` names a device record the Mac should retire as it mints the new
    /// one (a re-pair), so a rejected credential doesn't linger as a ghost.
    func pair(host: String, port: Int, code: String, replaces: String? = nil) {
        endpoint = Endpoint(host: host, port: port)
        pairingCode = code
        replacesDeviceId = replaces
        connect()
    }

    /// Connect for approve-on-Mac pairing: send a `pairRequest`, then wait (up to
    /// the pair guard) for the Mac to accept + the user to Allow. No code involved.
    func pairRequest(host: String, port: Int, replaces: String? = nil) {
        endpoint = Endpoint(host: host, port: port)
        pairRequestName = deviceName
        replacesDeviceId = replaces
        connect()
    }

    /// Force an immediate reconnect attempt (the "Retry" button) — skips any
    /// pending backoff wait.
    func retryNow() {
        cancelReconnect()
        wantConnected = true
        startAttempt()
    }

    /// Foreground probe: a `.ready` state after the app was backgrounded is often
    /// stale — iOS kills the socket within seconds, and a half-open cellular path
    /// even accepts sends — so a plain "already ready" check would leave the UI
    /// frozen until the next heartbeat notices. Ping now, with a short deadline of
    /// its own (on a dead path the ping itself can hang far longer than the user
    /// will wait), and hand a failure to the normal reconnect loop.
    func verifyNow() {
        if demoServer != nil { return } // the demo link never goes stale
        guard case .ready = state, let t = task, probeDeadline == nil else { return }
        let deadline = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.probeDeadline = nil
            guard t === self.task else { return }
            self.transientFailure("probe timeout")
        }
        probeDeadline = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + probeTimeout, execute: deadline)
        t.sendPing { [weak self] err in
            self?.main {
                guard let self else { return }
                self.probeDeadline?.cancel()
                self.probeDeadline = nil
                guard t === self.task else { return }
                if let err { self.transientFailure("probe failed", error: err) }
            }
        }
    }

    func disconnect() {
        wantConnected = false
        pairRequestName = nil
        replacesDeviceId = nil
        pairGuard?.cancel(); pairGuard = nil
        cancelReconnect()
        teardownTask()
        pendingSends.removeAll()
        set(.idle)
    }

    /// Retire this client for good: disconnect, then invalidate the URLSession so
    /// it releases its strong reference to the pinning delegate. For throwaway
    /// clients only (the push registrar's per-Mac connections) — the app's live
    /// client is reconnected, never retired.
    func shutdown() {
        disconnect()
        session?.invalidateAndCancel()
    }

    // MARK: connection lifecycle

    private func startAttempt() {
        // An unparseable host (e.g. an IPv6 literal a Mac advertised while this
        // build can't form its URL) must fail like any unreachable candidate —
        // retryable, so the model's stale-host repick tries the other saved
        // addresses — not dead-end the state machine. During approve-on-Mac
        // pairing there are no other addresses to fall back to, and routing it
        // through `transientFailure` would report the address problem as the Mac
        // never answering, so name it for what it is.
        guard let url = endpoint.url else {
            if pairRequestName != nil { return failPair(Self.badAddressReason) }
            return transientFailure("bad host")
        }
        teardownTask()
        set(.connecting)
        let task = session.webSocketTask(with: url)
        // URLSession defaults this to 1MiB and fails the receive — killing the
        // connection — for anything larger. A batched gitDiffs reply or a notes
        // attachment clears that easily. 16MiB matches the largest frame the Mac
        // will write, so the ceiling is the desktop's cap rather than this one.
        task.maximumMessageSize = 16 * 1024 * 1024
        self.task = task
        // Handshake: pair-request (approve-on-Mac), pair (one-time code), else auth.
        // Held until the socket reports open (`noteOpened`) rather than sent right
        // after resume: on a slow path (cellular via Tailscale) a send issued
        // while the TLS handshake is still in flight can fail and tear down a
        // connection that was about to succeed — the exact away-from-home case.
        if let name = pairRequestName {
            pendingHandshakeFrame = Wire.pairRequest(name: name, replaces: replacesDeviceId)
        } else if let code = pairingCode {
            pendingHandshakeFrame = Wire.pair(code: code, name: deviceName, replaces: replacesDeviceId)
        } else if let c = credential {
            pendingHandshakeFrame = Wire.auth(deviceId: c.deviceId, token: c.token)
        } else {
            return fatal("no credential")
        }
        task.resume()
        receiveLoop(task)
        // Approve-on-Mac waits on the user, which outlasts the connect watchdog —
        // the pair guard bounds that mode instead.
        if pairRequestName != nil { armPairGuard() } else { startWatchdog() }
    }

    /// Bound an approve-on-Mac pairing so a silent Mac can't hang the UI: if neither
    /// a `paired` nor a `pairDenied` lands in time, surface a timeout and tear down.
    private func armPairGuard() {
        pairGuard?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.pairRequestName != nil else { return }
            self.failPair("timeout")
        }
        pairGuard = work
        DispatchQueue.main.asyncAfter(deadline: .now() + pairGuardTimeout, execute: work)
    }

    /// End an in-flight approve-on-Mac pairing without success: stop retrying, tear
    /// the socket down, and report the reason.
    private func failPair(_ reason: String) {
        pairRequestName = nil
        replacesDeviceId = nil
        pairGuard?.cancel(); pairGuard = nil
        wantConnected = false
        cancelReconnect()
        teardownTask()
        pendingSends.removeAll()
        set(.idle)
        onPairDenied?(reason)
    }

    /// Reached `ready` (or `paired`): the link is live. Clear backoff and start
    /// the heartbeat that keeps the tunnel warm and detects silent drops.
    private func onConnected() {
        retryAttempt = 0
        failureHint = Self.offlineHint
        connectWatchdog?.cancel(); connectWatchdog = nil
        startHeartbeat()
    }

    /// A retryable failure — transport dropped, a send/ping failed, or the connect
    /// watchdog fired. Tears down and schedules a backoff retry (unless we've been
    /// intentionally disconnected). When the transport handed us an error, keep
    /// its shape so the eventual offline message can say *how* it failed —
    /// "unreachable", "secure handshake failed", and "refused" need different
    /// user action.
    private func transientFailure(_ reason: String, error: Error? = nil) {
        failureHint = Self.classifyFailure(error)
        lastTransportErrorCode = (error as NSError?).flatMap {
            $0.domain == NSURLErrorDomain ? $0.code : nil
        }
        lastTransportErrorChain = Self.errorChain(error)
        // A dropped socket during approve-on-Mac pairing must not retry (a retry
        // pops a fresh Allow dialog); surface it as a no-answer timeout instead.
        if pairRequestName != nil { failPair("timeout"); return }
        teardownTask()
        guard wantConnected else { return }
        scheduleReconnect(reason)
    }

    /// -1200...-1206 is URLSession's TLS band (handshake failed, cert rejected,
    /// bad date, ...). A nil or unrecognized error resets to the generic hint so
    /// a stale classification never outlives the failure mode that produced it.
    private static func classifyFailure(_ error: Error?) -> String {
        guard let e = error as NSError?, e.domain == NSURLErrorDomain else {
            return offlineHint
        }
        if (NSURLErrorClientCertificateRequired ... NSURLErrorSecureConnectionFailed)
            .contains(e.code) {
            return secureFailedError
        }
        if e.code == NSURLErrorCannotConnectToHost { return refusedError }
        return offlineHint
    }

    /// A terminal failure — the server rejected our auth/pairing, or the endpoint
    /// is unusable. Stop retrying; the user must act (re-pair / fix the address).
    private func fatal(_ msg: String) {
        wantConnected = false
        cancelReconnect()
        teardownTask()
        pendingSends.removeAll()
        set(.failed(msg))
    }

    private func scheduleReconnect(_ reason: String) {
        guard wantConnected, reconnectWork == nil else { return }
        retryAttempt += 1
        let capped = min(baseBackoff * pow(2, Double(retryAttempt - 1)), maxBackoff)
        let delay = capped * Double.random(in: 0.85...1.15)
        // Stay hopeful ("connecting") for the first few fast retries; after that,
        // show the honest offline hint while the slow retries continue underneath.
        set(retryAttempt <= patientAttempts ? .connecting : .failed(failureHint))
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.reconnectWork = nil
            guard self.wantConnected else { return }
            self.startAttempt()
        }
        reconnectWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func startWatchdog() {
        connectWatchdog?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.wantConnected else { return }
            if case .ready = self.state { return }
            self.transientFailure("timed out")
        }
        connectWatchdog = work
        DispatchQueue.main.asyncAfter(deadline: .now() + connectTimeout, execute: work)
    }

    private func startHeartbeat() {
        if demoServer != nil { return } // no socket to keep warm in Demo Mode
        stopHeartbeat()
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + heartbeatInterval, repeating: heartbeatInterval)
        timer.setEventHandler { [weak self] in
            guard let self, let t = self.task else { return }
            // A ping still outstanding from the previous tick is already a dead
            // link — fail now rather than stack a second ping onto it. Unless the
            // whole app was suspended through the wait, in which case nothing was
            // measured and the resume probe decides.
            guard self.heartbeatDeadline == nil else {
                if self.wasSuspendedSinceArming { self.deferToResumeProbe() } else {
                    self.transientFailure("ping timeout")
                }
                return
            }
            // On a black-holed path (wedged tunnel, WiFi→cellular hop with no
            // RST) the ping completion never fires at all, so a deadline — the
            // `verifyNow` pattern — is what actually detects the drop.
            let deadline = DispatchWorkItem { [weak self] in
                guard let self else { return }
                let suspended = self.wasSuspendedSinceArming
                self.heartbeatDeadline = nil
                self.heartbeatArmedAt = nil
                guard t === self.task else { return }
                if suspended { self.verifyNow() } else { self.transientFailure("ping timeout") }
            }
            self.heartbeatDeadline = deadline
            self.heartbeatArmedAt = Date()
            DispatchQueue.main.asyncAfter(deadline: .now() + self.heartbeatPongTimeout, execute: deadline)
            t.sendPing { [weak self] err in
                self?.main {
                    guard let self, t === self.task else { return }
                    self.heartbeatDeadline?.cancel()
                    self.heartbeatDeadline = nil
                    self.heartbeatArmedAt = nil
                    if let err { self.transientFailure("ping failed", error: err) }
                }
            }
        }
        timer.resume()
        heartbeat = timer
    }

    /// True when far more wall time passed since the outstanding ping was armed
    /// than its deadline allows — the app was suspended through the wait, so the
    /// missing pong measures nothing about the link.
    private var wasSuspendedSinceArming: Bool {
        guard let armed = heartbeatArmedAt else { return false }
        return Date().timeIntervalSince(armed) > heartbeatSuspendSlack
    }

    /// Drop a ping whose wait was slept through and re-test the link with the
    /// bounded resume probe instead of declaring a failure the wait never proved.
    private func deferToResumeProbe() {
        heartbeatDeadline?.cancel()
        heartbeatDeadline = nil
        heartbeatArmedAt = nil
        verifyNow()
    }

    private func stopHeartbeat() {
        heartbeat?.cancel()
        heartbeat = nil
        heartbeatDeadline?.cancel()
        heartbeatDeadline = nil
        heartbeatArmedAt = nil
    }

    private func cancelReconnect() {
        reconnectWork?.cancel(); reconnectWork = nil
        retryAttempt = 0
    }

    private func teardownTask() {
        connectWatchdog?.cancel(); connectWatchdog = nil
        probeDeadline?.cancel(); probeDeadline = nil
        stopHeartbeat()
        pendingHandshakeFrame = nil
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    /// The socket finished its TLS + WebSocket handshake — now it's safe to send
    /// the auth/pair frame that opens the session.
    func noteOpened(_ opened: URLSessionWebSocketTask) {
        main { [weak self] in
            guard let self, opened === self.task,
                  let frame = self.pendingHandshakeFrame else { return }
            self.pendingHandshakeFrame = nil
            self.transmit(frame, requeueOnFailure: false)
        }
    }

    // MARK: requests

    func requestProjects() { send(Wire.projects()) }
    func requestSidebar() { send(Wire.sidebar()) }
    func requestStats(days: Int) { send(Wire.stats(days: days)) }
    func requestLimits() { send(Wire.limits()) }
    func requestSpeech(reqId: String, text: String) { send(Wire.ttsSpeak(reqId: reqId, text: text)) }
    func requestTerminals(project: String) { send(Wire.terminals(project: project)) }
    func requestSlash(id: String, project: String) { send(Wire.slash(id: id, project: project)) }
    func uploadBlob(_ id: String, _ b64: String, mime: String, name: String?, reqId: String) {
        send(Wire.upload(id: id, data: b64, mime: mime, name: name, reqId: reqId))
    }
    func requestMentions(project: String) { send(Wire.mentions(project: project)) }
    func requestHistory(project: String, q: String) { send(Wire.history(project: project, q: q)) }
    func recordHistory(project: String, id: String, label: String, text: String) {
        send(Wire.historyAdd(project: project, id: id, label: label, text: text))
    }
    func requestStatus(project: String) { send(Wire.status(project: project)) }
    func clearStatus(project: String, paneId: String, value: String) {
        send(Wire.clearStatus(project: project, paneId: paneId, value: value))
    }
    func requestJobs() { send(Wire.jobs()) }
    func requestJobHistory(project: String, jobId: String) {
        send(Wire.jobHistory(project: project, jobId: jobId))
    }
    func requestJobLiveOutput(project: String, jobId: String) {
        send(Wire.jobLiveOutput(project: project, jobId: jobId))
    }
    func runJob(project: String, jobId: String) { send(Wire.runJob(project: project, jobId: jobId)) }
    func stopJob(project: String, jobId: String) { send(Wire.stopJob(project: project, jobId: jobId)) }
    func setJobEnabled(project: String, jobId: String, enabled: Bool) {
        send(Wire.setJobEnabled(project: project, jobId: jobId, enabled: enabled))
    }
    func markJobSeen(project: String, jobId: String, at: Int?) {
        send(Wire.markJobSeen(project: project, jobId: jobId, at: at))
    }
    func markAllJobsSeen() { send(Wire.markAllJobsSeen()) }
    func requestJobConfig(project: String, jobId: String, source: String) {
        send(Wire.jobConfig(project: project, jobId: jobId, source: source))
    }
    func saveJob(id: String, source: String, project: String, job: [String: Any]) {
        send(Wire.saveJob(id: id, source: source, project: project, job: job))
    }
    func deleteJob(id: String, source: String, project: String, deleteCopies: Bool) {
        send(Wire.deleteJob(id: id, source: source, project: project, deleteCopies: deleteCopies))
    }
    func sendJobFollowup(project: String, jobId: String, at: Int, message: String,
                         agent: String, model: String, effort: String) {
        send(Wire.sendJobFollowup(project: project, jobId: jobId, at: at, message: message,
                                  agent: agent, model: model, effort: effort))
    }
    func runAction(project: String, action: String,
                   inputValues: [String: String] = [:], confirmed: Bool = false) {
        send(Wire.runAction(project: project, action: action, inputValues: inputValues, confirmed: confirmed))
    }
    func runActionBackground(project: String, action: String,
                             inputValues: [String: String], runId: String) {
        send(Wire.runActionBackground(project: project, action: action,
                                      inputValues: inputValues, runId: runId))
    }
    func requestActionBgOutput(project: String, runId: String) {
        send(Wire.actionBgOutput(project: project, runId: runId))
    }
    func cancelActionBackground(runId: String) { send(Wire.cancelActionBackground(runId: runId)) }
    func requestBackgroundRuns(project: String) { send(Wire.backgroundRuns(project: project)) }
    func newTerminal(project: String) { send(Wire.newTerminal(project: project)) }
    func closeTerminal(project: String, id: String) { send(Wire.closeTerminal(project: project, id: id)) }
    func renameTerminal(project: String, id: String, label: String) {
        send(Wire.renameTerminal(project: project, id: id, label: label))
    }
    func pinTerminal(project: String, id: String) { send(Wire.pinTerminal(project: project, id: id)) }
    func reorderTerminals(project: String, order: [String]) {
        send(Wire.reorderTerminals(project: project, order: order))
    }
    func duplicateProject(_ name: String, options: DuplicateOptions) {
        send(Wire.duplicate(name: name, options: options))
    }
    func requestDuplicateDefaults() { send(Wire.duplicateDefaults()) }
    func removeProject(_ name: String) { send(Wire.remove(name: name)) }
    func renameProject(project: String, name: String) {
        send(Wire.renameProject(project: project, name: name))
    }
    func sidebarCreateFolder(name: String) { send(Wire.sidebarCreateFolder(name: name)) }
    func sidebarRenameFolder(name: String, newName: String) {
        send(Wire.sidebarRenameFolder(name: name, newName: newName))
    }
    func sidebarDeleteFolder(name: String) { send(Wire.sidebarDeleteFolder(name: name)) }
    func sidebarMoveProject(project: String, folder: String?) {
        send(Wire.sidebarMoveProject(project: project, folder: folder))
    }
    func readFile(project: String, path: String) { send(Wire.readFile(project: project, path: path)) }
    func sendApnsToken(token: String, env: String, key: String,
                       notifyWaiting: Bool, notifyDone: Bool, notifyError: Bool,
                       notifyAutomationStarted: Bool, notifyAutomationDone: Bool,
                       notifyAutomationError: Bool) {
        send(Wire.apnsToken(token: token, env: env, key: key,
                            notifyWaiting: notifyWaiting, notifyDone: notifyDone,
                            notifyError: notifyError,
                            notifyAutomationStarted: notifyAutomationStarted,
                            notifyAutomationDone: notifyAutomationDone,
                            notifyAutomationError: notifyAutomationError))
    }
    func startProject(_ name: String, profile: String = "") { send(Wire.start(name: name, profile: profile)) }
    func stopProject(_ name: String) { send(Wire.stop(name: name)) }
    func toggleService(_ name: String, service: String) { send(Wire.toggleService(name: name, service: service)) }

    // Project creation / discovery + config editing requests. The reads
    // (listDirs/listSshHosts/readConfig/serviceBody/actionBody) reply quickly; the
    // writes run on the Mac's worker thread and reply when done (cloneProject can
    // take a while — the model arms a longer timeout around it).
    func requestDirs(path: String) { send(Wire.listDirs(path: path)) }
    func requestSshHosts() { send(Wire.listSshHosts()) }
    func createProject(name: String, root: String) { send(Wire.createProject(name: name, root: root)) }
    func createSshProject(name: String, ssh: [String: Any]) {
        send(Wire.createSshProject(name: name, ssh: ssh))
    }
    func cloneProject(name: String, url: String, branch: String, destParent: String) {
        send(Wire.cloneProject(name: name, url: url, branch: branch, destParent: destParent))
    }
    func requestConfig(project: String, layer: String) { send(Wire.readConfig(project: project, layer: layer)) }
    func saveConfig(project: String, layer: String, content: String) {
        send(Wire.saveConfig(project: project, layer: layer, content: content))
    }
    func requestServiceBody(project: String, key: String) { send(Wire.serviceBody(project: project, key: key)) }
    func requestActionBody(project: String, key: String) { send(Wire.actionBody(project: project, key: key)) }
    func saveService(project: String, key: String, payload: [String: Any], previousKey: String?) {
        send(Wire.saveService(project: project, key: key, payload: payload, previousKey: previousKey))
    }
    func deleteService(project: String, key: String) { send(Wire.deleteService(project: project, key: key)) }
    func saveProfile(project: String, name: String, services: [String], previousName: String?) {
        send(Wire.saveProfile(project: project, name: name, services: services, previousName: previousName))
    }
    func deleteProfile(project: String, name: String) { send(Wire.deleteProfile(project: project, name: name)) }
    func saveAction(project: String, key: String, payload: [String: Any], previousKey: String?, section: String?) {
        send(Wire.saveAction(project: project, key: key, payload: payload, previousKey: previousKey, section: section))
    }
    func deleteAction(project: String, key: String) { send(Wire.deleteAction(project: project, key: key)) }

    // Session memory + notes requests. All of them run on a worker thread on the
    // Mac, so their replies arrive out of order — match each one on the keys it
    // echoes back (project + name, chatId, message id, hash, query, beforeId).
    func requestMemory(project: String) { send(Wire.memory(project: project)) }
    func requestMemorySession(project: String, name: String) {
        send(Wire.memorySession(project: project, name: name))
    }
    /// Pass `baseline` to write only if the file still reads exactly like that;
    /// pass nil to overwrite unconditionally (an empty baseline means "must not
    /// exist yet", which is a different thing).
    func saveMemorySession(project: String, name: String, content: String, baseline: String?) {
        send(Wire.memorySave(project: project, name: name, content: content, baseline: baseline))
    }
    func deleteMemorySession(project: String, name: String) {
        send(Wire.memoryDelete(project: project, name: name))
    }
    func requestNotesChats(project: String) { send(Wire.notesChats(project: project)) }
    func notesCreateChat(project: String, title: String) {
        send(Wire.notesCreateChat(project: project, title: title))
    }
    func notesRenameChat(project: String, chatId: String, title: String) {
        send(Wire.notesRenameChat(project: project, chatId: chatId, title: title))
    }
    func notesDeleteChat(project: String, chatId: String) {
        send(Wire.notesDeleteChat(project: project, chatId: chatId))
    }
    func requestNotesMessages(project: String, chatId: String, limit: Int, beforeId: String) {
        send(Wire.notesMessages(project: project, chatId: chatId, limit: limit, beforeId: beforeId))
    }
    func notesAddMessage(project: String, chatId: String, text: String, attachments: [[String: Any]]) {
        send(Wire.notesAddMessage(project: project, chatId: chatId, text: text, attachments: attachments))
    }
    func notesEditMessage(project: String, id: String, text: String) {
        send(Wire.notesEditMessage(project: project, id: id, text: text))
    }
    func notesDeleteMessage(project: String, id: String) {
        send(Wire.notesDeleteMessage(project: project, id: id))
    }
    func notesSearch(project: String, query: String, limit: Int) {
        send(Wire.notesSearch(project: project, query: query, limit: limit))
    }
    func requestNotesAttachment(project: String, hash: String) {
        send(Wire.notesAttachment(project: project, hash: hash))
    }

    // Git review requests. The fast ones (git/gitDiff/gitCommit) reply quickly;
    // push/generate/create-PR do real work on the Mac and can take a long while,
    // so the model arms generous timeouts around them.
    func requestGit(project: String) { send(Wire.git(project: project)) }
    func requestGitDiff(project: String, path: String) { send(Wire.gitDiff(project: project, path: path)) }
    func requestGitDiffs(project: String, paths: [String]) { send(Wire.gitDiffs(project: project, paths: paths)) }
    func gitCommit(project: String, message: String, files: [String]) {
        send(Wire.gitCommit(project: project, message: message, files: files))
    }
    func gitPush(project: String) { send(Wire.gitPush(project: project)) }
    func gitGenMessage(project: String, files: [String]) { send(Wire.gitGenMessage(project: project, files: files)) }
    func gitGenPr(project: String) { send(Wire.gitGenPr(project: project)) }
    func gitCreatePr(project: String, title: String, body: String) {
        send(Wire.gitCreatePr(project: project, title: title, body: body))
    }
    func gitPull(project: String) { send(Wire.gitPull(project: project)) }
    func gitFetch(project: String) { send(Wire.gitFetch(project: project)) }
    func requestGitBranches(project: String) { send(Wire.gitBranches(project: project)) }
    func gitCheckout(project: String, branch: String, remote: String) {
        send(Wire.gitCheckout(project: project, branch: branch, remote: remote))
    }
    func gitCreateBranch(project: String, name: String) {
        send(Wire.gitCreateBranch(project: project, name: name))
    }
    func gitDiscardAll(project: String) { send(Wire.gitDiscardAll(project: project)) }
    func watchGit(project: String) {
        watchedProjects.insert(project)
        sendLive(Wire.gitWatch(project: project))
    }
    func unwatchGit(project: String) {
        watchedProjects.remove(project)
        sendLive(Wire.gitUnwatch(project: project))
    }

    // Composer parity requests.
    func requestComposerActions() { send(Wire.composerActions()) }
    // Keystroke-frequency, so fire-and-forget: the seed reconciles the current
    // draft after a reconnect, and a dropped frame is superseded by the next edit.
    func sendComposerDraft(_ id: String, text: String) {
        sendLive(Wire.composerDraft(id: id, text: text))
    }
    func runTransform(reqId: String, project: String, instruction: String, text: String, variants: Int) {
        send(Wire.transform(reqId: reqId, project: project, instruction: instruction, text: text, variants: variants))
    }
    func requestServices(project: String) { send(Wire.services(project: project)) }
    func requestServiceLogs(project: String, paneIndex: Int, lines: Int) {
        send(Wire.serviceLogs(project: project, paneIndex: paneIndex, lines: lines))
    }
    func requestHistoryQuery(project: String?, search: String?, favoritesOnly: Bool,
                             folder: String?, before: (at: Int, seq: Int)?) {
        send(Wire.historyQuery(project: project, search: search, favoritesOnly: favoritesOnly,
                               folder: folder, before: before))
    }
    func historySaveDraft(message: String, project: String?, id: String?,
                          label: String?, images: [String: String]?) {
        send(Wire.historySaveDraft(message: message, project: project, id: id, label: label, images: images))
    }
    func historyToggleFavorite(id: String) { send(Wire.historyToggleFavorite(id: id)) }
    func historySetFolder(id: String, folder: String?) { send(Wire.historySetFolder(id: id, folder: folder)) }
    func historyDelete(id: String) { send(Wire.historyDelete(id: id)) }
    func requestHistoryFolders() { send(Wire.historyFolders()) }
    func historyCreateFolder(name: String) { send(Wire.historyCreateFolder(name: name)) }
    func historyDeleteFolder(id: String?, name: String?) { send(Wire.historyDeleteFolder(id: id, name: name)) }

    /// Subscribe with an empty emulator: the Mac replays the current screen.
    func subscribe(_ id: String) {
        subscribed.insert(id)
        streamOffset[id] = nil
        awaitingSeed.insert(id)
        sendLive(Wire.sub(id: id))
    }

    /// Catch a terminal already on screen back up (the app was backgrounded, or
    /// output went missing) without disturbing what it shows. Falls back to a
    /// replay when the Mac no longer holds the missed slice. A request in flight
    /// already covers this, and a send dropped on a dead link is covered by the
    /// re-subscribe on the next `ready`.
    func resync(_ id: String) {
        guard subscribed.contains(id), !awaitingSeed.contains(id) else { return }
        awaitingSeed.insert(id)
        sendLive(Wire.sub(id: id, from: streamOffset[id]))
    }

    func unsubscribe(_ id: String) {
        subscribed.remove(id)
        streamOffset[id] = nil
        awaitingSeed.remove(id)
        sendLive(Wire.unsub(id: id))
    }

    /// Hand one output chunk to the terminal, using its stream position to keep
    /// the emulator consistent. Anything the pending seed will carry is dropped,
    /// and a chunk starting past where we are means output went missing — the
    /// desktop drops queued output for a phone that falls behind — so ask for the
    /// gap instead of applying an update the screen isn't ready for.
    private func deliverOutput(_ id: String, _ data: String, _ off: Int?) {
        guard !awaitingSeed.contains(id) else { return }
        if let off, let known = streamOffset[id] {
            if off <= known { return }
            guard off - data.utf8.count == known else { resync(id); return }
        }
        if let off { streamOffset[id] = off }
        onOutput?(id, data)
    }
    func claim(_ id: String) { send(Wire.claim(id: id)) }
    func sendInput(_ id: String, _ data: String) { sendLive(Wire.input(id: id, data: data)) }
    func resize(_ id: String, cols: Int, rows: Int) { sendLive(Wire.resize(id: id, cols: cols, rows: rows)) }

    // MARK: plumbing

    /// Reliable request send: queued while the link isn't ready, re-queued when
    /// the socket turns out to be dead, flushed on the next `ready`.
    private func send(_ text: String) {
        if let demoServer { demoServer.receive(text); return }
        guard task != nil, case .ready = state else {
            enqueue(text)
            return
        }
        transmit(text, requeueOnFailure: true)
    }

    /// Fire-and-forget send for live traffic (keystrokes, resizes, sub/unsub):
    /// dropped rather than replayed stale after a reconnect. Requires a live,
    /// authenticated link — a not-yet-`ready` socket would discard it silently.
    private func sendLive(_ text: String) {
        if let demoServer { demoServer.receive(text); return }
        guard task != nil, case .ready = state else { return }
        transmit(text, requeueOnFailure: false)
    }

    private func transmit(_ text: String, requeueOnFailure: Bool) {
        if let demoServer { demoServer.receive(text); return }
        guard let t = task else {
            if requeueOnFailure { enqueue(text) }
            return
        }
        t.send(.string(text)) { [weak self] err in
            guard err != nil else { return }
            self?.main {
                guard let self else { return }
                if requeueOnFailure { self.enqueue(text) }
                guard t === self.task else { return } // ignore a stale task's send
                self.transientFailure("send failed", error: err)
            }
        }
    }

    private func enqueue(_ text: String) {
        guard wantConnected else { return }
        // At the cap, drop this new send rather than silently evicting an older
        // queued request (which could be an important one, e.g. a git commit).
        guard pendingSends.count < maxPendingSends else {
            onSendQueueFull?()
            return
        }
        pendingSends.append(text)
    }

    private func flushPending() {
        guard case .ready = state, !pendingSends.isEmpty else { return }
        let queued = pendingSends
        pendingSends.removeAll()
        for frame in queued { transmit(frame, requeueOnFailure: true) }
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error):
                self.main {
                    guard task === self.task else { return } // a superseded task's callback
                    self.transientFailure("disconnected", error: error)
                }
            case .success(let message):
                // Parse off the main thread — this completion runs on URLSession's
                // background serial callback queue, and parse (text → JSON → value
                // structs) touches nothing @MainActor. Then hop to main only to
                // dispatch the already-parsed frame. The serial callback queue plus
                // the ordered main.async preserves frame order exactly.
                let frame: Wire.Inbound? = { if case .string(let text) = message { return Wire.Inbound.parse(text) } else { return nil } }()
                self.main {
                    guard task === self.task else { return } // a superseded task's callback
                    if let frame { self.dispatch(frame) }
                    self.receiveLoop(task)
                }
            }
        }
    }

    /// Dispatch one parsed inbound frame. Always called on the main queue.
    private func dispatch(_ frame: Wire.Inbound) {
        switch frame {
            case .paired(let deviceId, let token, let serverId, let serverName, let hosts):
                self.credential = Credential(deviceId: deviceId, token: token)
                self.pairingCode = nil
                self.pairRequestName = nil
                self.replacesDeviceId = nil
                self.pairGuard?.cancel(); self.pairGuard = nil
                self.set(.ready)
                self.onConnected()
                self.flushPending()
                // The model owns the Keychain (per-Mac) and the saved-Mac record.
                self.onPaired?(deviceId, token, serverId, serverName, hosts)
                self.onProjectsChanged?()
            case .pairPending(let matchCode):
                self.onPairPending?(matchCode)
            case .pairDenied(let reason):
                self.failPair(reason)
            case .ready(let serverId, let serverName, let hosts):
                self.set(.ready)
                self.onConnected()
                // Re-subscribe to any terminals we were watching before a drop,
                // each from where its screen got to, so a reconnect resumes the
                // stream instead of rebuilding the screen from a replay.
                self.awaitingSeed.removeAll()
                for id in self.subscribed { self.resync(id) }
                // Re-watch git for any review screen that was open before a drop.
                for p in self.watchedProjects { self.sendLive(Wire.gitWatch(project: p)) }
                self.flushPending()
                self.onIdentity?(serverId, serverName)
                if !hosts.isEmpty { self.onAdvertisedHosts?(serverId, hosts) }
            case .error(let e):
                // The Mac dropped this device's record: retrying the same
                // credential is pointless, so stop and report it as the sentinel
                // the model turns into a "pair again" prompt.
                self.fatal(e == "unauthorized" ? Self.unauthorizedError : e)
            case .projects(let p): self.onProjects?(p)
            case .sidebar(let order, let groups): self.onSidebar?(order, groups)
            case .stats(let stats, let error): self.onStats?(stats, error)
            case .limits(let snapshot, let error): self.onLimits?(snapshot, error)
            case .limitsChanged(let snapshot): self.onLimitsChanged?(snapshot)
            case .ttsSpeak(let reqId, let audio, let error): self.onSpeech?(reqId, audio, error)
            case .terminals(let proj, let t): self.onTerminals?(proj, t)
            case .slash(let id, let cmds): self.onSlash?(id, cmds)
            case .upload(let id, let reqId, let path): self.onUpload?(id, reqId, path)
            case .mentions(let proj, let entries): self.onMentions?(proj, entries)
            case .history(let proj, let rows): self.onHistory?(proj, rows)
            case .status(let proj, let s): self.onStatus?(proj, s)
            case .jobs(let jobs, let error): self.onJobs?(jobs, error)
            case .jobHistory(let project, let jobId, let entries, let error):
                self.onJobHistory?(project, jobId, entries, error)
            case .jobLiveOutput(let project, let jobId, let live, let error):
                self.onJobLiveOutput?(project, jobId, live, error)
            case .automationMutation(let project, let jobId, let error):
                self.onAutomationMutation?(project, jobId, error)
            case .automationFollowup(let project, let jobId, let error):
                self.onAutomationFollowup?(project, jobId, error)
            case .jobConfig(let project, let jobId, let job, let error):
                self.onJobConfig?(project, jobId, job, error)
            case .jobSaved(let id, let error): self.onJobSaved?(id, error)
            case .jobDeleted(let id, let error): self.onJobDeleted?(id, error)
            case .jobsChanged: self.onJobsChanged?()
            case .seed(let id, let c, let r, let d, let owner, let draftText, let draftRev, let off, let reset):
                self.streamOffset[id] = off
                self.awaitingSeed.remove(id)
                self.onControl?(id, owner)
                self.onSeed?(id, c, r, d, reset)
                if let draftText {
                    self.onComposerDraft?(id, draftText, draftRev, "mac", true)
                }
            case .control(let id, let owner): self.onControl?(id, owner)
            case .output(let id, let d, let off): self.deliverOutput(id, d, off)
            case .exit(let id, let code):
                self.streamOffset[id] = nil
                self.awaitingSeed.remove(id)
                self.onExit?(id, code)
            // A duplicate/remove reply lands only after the desktop finished the
            // folder clone/delete and rewrote its config, so a re-request is
            // guaranteed to reflect it — don't rely on the projects-changed push
            // alone (it can race the multi-second clone that blocks this socket).
            case .duplicateDefaults(let excl, let reinstall, let pull):
                self.onDuplicateDefaults?(excl, reinstall, pull)
            case .duplicateProgress(let done, let total, let name):
                self.onDuplicateProgress?(done, total, name)
            case .duplicate(_, let error, let warning):
                self.onDuplicateDone?(error, warning)
            case .remove(let error):
                if let error { self.onActionError?(error) } else { self.onProjectsChanged?() }
            case .renameProject(let proj, let error): self.onRenameProject?(proj, error)
            case .sidebarMutation(let order, let groups, let error):
                self.onSidebarMutation?(order, groups, error)
            case .file(let proj, let path, let content, let truncated, let error):
                self.onFile?(proj, path, content, truncated, error)
            case .actionFailed(let project, let error):
                self.onActionFailed?(project, error)
            case .projectsChanged: self.onProjectsChanged?()
            case .statusChanged(let proj): self.onStatusChanged?(proj)
            case .git(let proj, let snapshot, let error):
                self.onGit?(proj, snapshot, error)
            case .gitDiff(let proj, let path, let diff, let binary, let truncated, let error):
                let result = error == nil ? GitDiffResult(diff: diff, binary: binary, truncated: truncated) : nil
                self.onGitDiff?(proj, path, result, error)
            case .gitDiffs(let proj, let entries, let error):
                self.onGitDiffs?(proj, entries, error)
            case .gitCommit(let proj, let error): self.onGitCommit?(proj, error)
            case .gitPush(let proj, let error): self.onGitPush?(proj, error)
            case .gitGenMessage(let proj, let message, let error): self.onGitGenMessage?(proj, message, error)
            case .gitGenPr(let proj, let title, let body, let error): self.onGitGenPr?(proj, title, body, error)
            case .gitCreatePr(let proj, let url, let error): self.onGitCreatePr?(proj, url, error)
            case .gitPull(let proj, let error): self.onGitPull?(proj, error)
            case .gitFetch(let proj, let error): self.onGitFetch?(proj, error)
            case .gitBranches(let proj, let current, let branches, let error):
                self.onGitBranches?(proj, current, branches, error)
            case .gitCheckout(let proj, let error): self.onGitCheckout?(proj, error)
            case .gitCreateBranch(let proj, let error): self.onGitCreateBranch?(proj, error)
            case .gitDiscardAll(let proj, let error): self.onGitDiscardAll?(proj, error)
            case .gitChanged(let proj): self.onGitChanged?(proj)
            case .apnsToken(let ok): self.onApnsToken?(ok)
            case .composerActions(let actions): self.onComposerActions?(actions)
            case .transformVariant(let reqId, let idx, let text, let error):
                self.onTransformVariant?(reqId, idx, text, error)
            case .transformDone(let reqId, let ok): self.onTransformDone?(reqId, ok)
            case .composerDraft(let id, let text, let rev, let origin):
                self.onComposerDraft?(id, text, rev, origin, false)
            case .services(let proj, let running, let services, let error):
                self.onServices?(proj, running, services, error)
            case .serviceLogs(let proj, let pane, let text, let error):
                self.onServiceLogs?(proj, pane, text, error)
            case .actionBgOutput(let runId, let snapshot):
                self.onActionBgOutput?(runId, snapshot)
            case .actionBgStartFailed(let runId, let error):
                self.onActionBgStartFailed?(runId, error)
            case .backgroundRuns(let proj, let runs):
                self.onBackgroundRuns?(proj, runs)
            case .historyQuery(let items, let hasMore): self.onHistoryQuery?(items, hasMore)
            case .historySaveDraft(let ok): self.onHistorySaveDraft?(ok)
            case .historyToggleFavorite(let id, let favorite, let error):
                self.onHistoryToggleFavorite?(id, favorite, error)
            case .historyMutated(let ok, let error): self.onHistoryMutated?(ok, error)
            case .historyFolders(let folders): self.onHistoryFolders?(folders)
            case .historyCreateFolder(let folder, let error): self.onHistoryCreateFolder?(folder, error)
            case .listDirs(let listing, let error): self.onListDirs?(listing, error)
            case .listSshHosts(let hosts, let error): self.onListSshHosts?(hosts, error)
            case .createProject(let name, let error): self.onCreateProject?(name, error)
            case .createSshProject(let name, let error): self.onCreateSshProject?(name, error)
            case .cloneProject(let name, let error): self.onCloneProject?(name, error)
            case .readConfig(let project, let layer, let content, let available, let error):
                self.onReadConfig?(project, layer, content, available, error)
            case .saveConfig(let project, let layer, let name, let error):
                self.onSaveConfig?(project, layer, name, error)
            case .serviceBody(let project, let key, let body, let source, let error):
                self.onServiceBody?(project, key, body, source, error)
            case .actionBody(let project, let key, let body, let section, let source, let error):
                self.onActionBody?(project, key, body, section, source, error)
            case .saveService(let project, let key, let error): self.onSaveService?(project, key, error)
            case .deleteService(let project, let key, let error): self.onDeleteService?(project, key, error)
            case .saveProfile(let project, let name, let error): self.onSaveProfile?(project, name, error)
            case .deleteProfile(let project, let name, let error): self.onDeleteProfile?(project, name, error)
            case .saveAction(let project, let key, let error): self.onSaveAction?(project, key, error)
            case .deleteAction(let project, let key, let error): self.onDeleteAction?(project, key, error)
            case .memory(let project, let list, let error): self.onMemory?(project, list, error)
            case .memorySession(let project, let name, let session, let error):
                self.onMemorySession?(project, name, session, error)
            case .memorySave(let project, let name, let error): self.onMemorySave?(project, name, error)
            case .memoryDelete(let project, let name, let error): self.onMemoryDelete?(project, name, error)
            case .memoryChanged(let project): self.onMemoryChanged?(project)
            case .notesChats(let project, let chats, let error): self.onNotesChats?(project, chats, error)
            case .notesCreateChat(let project, let chat, let error):
                self.onNotesCreateChat?(project, chat, error)
            case .notesRenameChat(let project, let chatId, let error):
                self.onNotesRenameChat?(project, chatId, error)
            case .notesDeleteChat(let project, let chatId, let error):
                self.onNotesDeleteChat?(project, chatId, error)
            case .notesMessages(let project, let chatId, let beforeId, let messages, let error):
                self.onNotesMessages?(project, chatId, beforeId, messages, error)
            case .notesAddMessage(let project, let chatId, let message, let error):
                self.onNotesAddMessage?(project, chatId, message, error)
            case .notesEditMessage(let project, let id, let error):
                self.onNotesEditMessage?(project, id, error)
            case .notesDeleteMessage(let project, let id, let error):
                self.onNotesDeleteMessage?(project, id, error)
            case .notesSearch(let project, let query, let hits, let error):
                self.onNotesSearch?(project, query, hits, error)
            case .notesAttachment(let project, let hash, let data, let error):
                self.onNotesAttachment?(project, hash, data, error)
            case .pong, .unknown: break
        }
    }

    private func set(_ s: State) {
        state = s
        onState?(s)
    }

    private func main(_ block: @escaping () -> Void) {
        DispatchQueue.main.async(execute: block)
    }
}

/// Forms `wss://` URLs from any saved host form, shared by the live socket and
/// the reachability probe. `URL(string:)` returns nil for a bare IPv6 literal —
/// and a nil URL used to dead-end the connection state machine — so IPv6 hosts
/// (kept deliberately as an away-from-home fallback) are bracketed here, with
/// any zone id's `%` percent-encoded per RFC 6874. Hostnames, IPv4 literals,
/// and already-bracketed input pass through unchanged.
enum WssURL {
    static func make(host: String, port: Int) -> URL? {
        URL(string: "wss://\(urlHost(host)):\(port)/")
    }

    private static func urlHost(_ host: String) -> String {
        let trimmed = host.trimmingCharacters(in: .whitespaces)
        guard trimmed.contains(":"), !trimmed.hasPrefix("[") else { return trimmed }
        return "[\(trimmed.replacingOccurrences(of: "%", with: "%25"))]"
    }
}

/// Evaluates the server's TLS trust for the wss:// link with trust-on-first-use
/// certificate pinning. The desktop serves a self-signed cert, so default trust
/// evaluation always fails; instead the identity is the SHA-256 of the leaf
/// certificate's DER bytes, matched against a per-Mac pin.
///
/// - `expected` (QR pairing): the fingerprint the QR advertised — accept iff the
///   observed cert matches it, else abort the pairing.
/// - `pinProvider` (reconnect): the stored pin for this Mac, read fresh each
///   handshake — accept iff it matches; a nil pin is a first/migration connect,
///   accepted so the model can pin the observed fingerprint after auth (TOFU).
///
/// `@unchecked Sendable`: the mutable `observed` is guarded by the lock, and the
/// immutable config is set before the session issues any challenge.
final class PinningDelegate: NSObject, URLSessionDelegate, URLSessionWebSocketDelegate, @unchecked Sendable {
    weak var client: LpmClient?

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocolName: String?) {
        client?.noteOpened(webSocketTask)
    }
    private let pinProvider: (() -> String?)?
    private let expected: String?
    private let lock = NSLock()
    private var _observed: String?

    var observed: String? {
        lock.lock(); defer { lock.unlock() }
        return _observed
    }

    init(pinProvider: (() -> String?)?, expected: String?) {
        self.pinProvider = pinProvider
        self.expected = expected
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust,
              let fingerprint = CertPinning.leafFingerprint(trust) else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        lock.lock(); _observed = fingerprint; lock.unlock()

        let accept = { completionHandler(.useCredential, URLCredential(trust: trust)) }

        if let expected {
            if fingerprint == expected { accept() }
            else {
                completionHandler(.cancelAuthenticationChallenge, nil)
                client?.notePinMismatch(pairing: true)
            }
            return
        }
        if let pin = pinProvider?() {
            if fingerprint == pin { accept() }
            else {
                completionHandler(.cancelAuthenticationChallenge, nil)
                client?.notePinMismatch(pairing: false)
            }
            return
        }
        // No pin yet (fresh pair, or a Mac paired before TLS existed): accept and
        // let the model pin the observed fingerprint once auth/pair succeeds.
        accept()
    }
}

/// Certificate-identity helpers shared by the live socket and the reachability
/// probe: the pinned identity is the lowercase hex SHA-256 of the leaf
/// certificate's DER encoding.
enum CertPinning {
    static func leafFingerprint(_ trust: SecTrust) -> String? {
        guard let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first else { return nil }
        let der = SecCertificateCopyData(leaf) as Data
        return sha256Hex(der)
    }

    static func sha256Hex(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
