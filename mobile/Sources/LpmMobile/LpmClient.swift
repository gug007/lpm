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
        var url: URL? { URL(string: "wss://\(host):\(port)/") }
    }

    // Callbacks are delivered on the main queue.
    var onState: ((State) -> Void)?
    var onOutput: ((_ id: String, _ data: String) -> Void)?
    var onSeed: ((_ id: String, _ cols: Int, _ rows: Int, _ data: String) -> Void)?
    var onControl: ((_ id: String, _ owner: ControlOwner?) -> Void)?
    var onExit: ((_ id: String, _ code: Int) -> Void)?
    var onProjects: (([Project]) -> Void)?
    var onSidebar: ((_ order: [String], _ groups: [ProjectFolder]) -> Void)?
    var onStats: ((_ stats: AgentStats?, _ error: String?) -> Void)?
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
    // or dedupes the saved-Mac record. serverId/serverName are absent on older Macs.
    var onPaired: ((_ deviceId: String, _ token: String, _ serverId: String?, _ serverName: String?) -> Void)?
    // Approve-on-Mac pairing: the request was accepted (dialog up on the Mac,
    // carrying the match code to display), or refused with a reason.
    var onPairPending: ((_ matchCode: String) -> Void)?
    var onPairDenied: ((_ reason: String) -> Void)?
    // A reconnect reached `ready` carrying the Mac's identity, so the active
    // record can learn/refresh its serverId and name. Absent on older Macs.
    var onIdentity: ((_ serverId: String?, _ serverName: String?) -> Void)?
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

    private var endpoint: Endpoint
    private var credential: Credential?
    private var pairingCode: String?
    // Non-nil while an approve-on-Mac pairing is in flight: the device name sent in
    // the first `pairRequest` frame. This mode never auto-retries (a retry would
    // pop a second Allow dialog) and never runs the connect watchdog (approval can
    // take longer than it); the pair guard below bounds it instead.
    private var pairRequestName: String?
    private var pairGuard: DispatchWorkItem?
    private let pairGuardTimeout: TimeInterval = 35
    private var deviceName: String
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var subscribed = Set<String>() // termIds we auto-re-sub on reconnect
    private var watchedProjects = Set<String>() // projects we auto-re-watch on reconnect
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
    private var probeDeadline: DispatchWorkItem?
    private let connectTimeout: TimeInterval = 10
    private let heartbeatInterval: TimeInterval = 20
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

    init(endpoint: Endpoint, credential: Credential?, deviceName: String,
         pinProvider: (() -> String?)? = nil, expectedFingerprint: String? = nil) {
        self.endpoint = endpoint
        self.credential = credential
        self.deviceName = deviceName
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
        guard endpoint.url != nil else { return fatal("bad host") }
        wantConnected = true
        cancelReconnect()
        startAttempt()
    }

    /// Connect to consume a one-time pairing code scanned from the desktop QR.
    func pair(host: String, port: Int, code: String) {
        endpoint = Endpoint(host: host, port: port)
        pairingCode = code
        connect()
    }

    /// Connect for approve-on-Mac pairing: send a `pairRequest`, then wait (up to
    /// the pair guard) for the Mac to accept + the user to Allow. No code involved.
    func pairRequest(host: String, port: Int) {
        endpoint = Endpoint(host: host, port: port)
        pairRequestName = deviceName
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
        pairGuard?.cancel(); pairGuard = nil
        cancelReconnect()
        teardownTask()
        pendingSends.removeAll()
        set(.idle)
    }

    // MARK: connection lifecycle

    private func startAttempt() {
        guard let url = endpoint.url else { return fatal("bad host") }
        teardownTask()
        set(.connecting)
        let task = session.webSocketTask(with: url)
        self.task = task
        // Handshake: pair-request (approve-on-Mac), pair (one-time code), else auth.
        // Held until the socket reports open (`noteOpened`) rather than sent right
        // after resume: on a slow path (cellular via Tailscale) a send issued
        // while the TLS handshake is still in flight can fail and tear down a
        // connection that was about to succeed — the exact away-from-home case.
        if let name = pairRequestName {
            pendingHandshakeFrame = Wire.pairRequest(name: name)
        } else if let code = pairingCode {
            pendingHandshakeFrame = Wire.pair(code: code, name: deviceName)
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
        stopHeartbeat()
        let timer = DispatchSource.makeTimerSource(queue: .main)
        timer.schedule(deadline: .now() + heartbeatInterval, repeating: heartbeatInterval)
        timer.setEventHandler { [weak self] in
            guard let self, let t = self.task else { return }
            t.sendPing { [weak self] err in
                guard err != nil else { return }
                self?.main {
                    guard let self, t === self.task else { return }
                    self.transientFailure("ping timeout", error: err)
                }
            }
        }
        timer.resume()
        heartbeat = timer
    }

    private func stopHeartbeat() {
        heartbeat?.cancel()
        heartbeat = nil
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

    func subscribe(_ id: String) {
        subscribed.insert(id)
        sendLive(Wire.sub(id: id))
    }
    func unsubscribe(_ id: String) {
        subscribed.remove(id)
        sendLive(Wire.unsub(id: id))
    }
    func claim(_ id: String) { send(Wire.claim(id: id)) }
    func sendInput(_ id: String, _ data: String) { sendLive(Wire.input(id: id, data: data)) }
    func resize(_ id: String, cols: Int, rows: Int) { sendLive(Wire.resize(id: id, cols: cols, rows: rows)) }

    // MARK: plumbing

    /// Reliable request send: queued while the link isn't ready, re-queued when
    /// the socket turns out to be dead, flushed on the next `ready`.
    private func send(_ text: String) {
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
        guard task != nil, case .ready = state else { return }
        transmit(text, requeueOnFailure: false)
    }

    private func transmit(_ text: String, requeueOnFailure: Bool) {
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
            case .paired(let deviceId, let token, let serverId, let serverName):
                self.credential = Credential(deviceId: deviceId, token: token)
                self.pairingCode = nil
                self.pairRequestName = nil
                self.pairGuard?.cancel(); self.pairGuard = nil
                self.set(.ready)
                self.onConnected()
                self.flushPending()
                // The model owns the Keychain (per-Mac) and the saved-Mac record.
                self.onPaired?(deviceId, token, serverId, serverName)
                self.onProjectsChanged?()
            case .pairPending(let matchCode):
                self.onPairPending?(matchCode)
            case .pairDenied(let reason):
                self.failPair(reason)
            case .ready(let serverId, let serverName):
                self.set(.ready)
                self.onConnected()
                // Re-subscribe to any terminals we were watching before a drop.
                for id in self.subscribed { self.sendLive(Wire.sub(id: id)) }
                // Re-watch git for any review screen that was open before a drop.
                for p in self.watchedProjects { self.sendLive(Wire.gitWatch(project: p)) }
                self.flushPending()
                self.onIdentity?(serverId, serverName)
            case .error(let e):
                self.fatal(e)
            case .projects(let p): self.onProjects?(p)
            case .sidebar(let order, let groups): self.onSidebar?(order, groups)
            case .stats(let stats, let error): self.onStats?(stats, error)
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
            case .seed(let id, let c, let r, let d, let owner, let draftText, let draftRev):
                self.onControl?(id, owner)
                self.onSeed?(id, c, r, d)
                if let draftText {
                    self.onComposerDraft?(id, draftText, draftRev, "mac", true)
                }
            case .control(let id, let owner): self.onControl?(id, owner)
            case .output(let id, let d): self.onOutput?(id, d)
            case .exit(let id, let code): self.onExit?(id, code)
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
