import Foundation

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
        var url: URL? { URL(string: "ws://\(host):\(port)/") }
    }

    // Callbacks are delivered on the main queue.
    var onState: ((State) -> Void)?
    var onOutput: ((_ id: String, _ data: String) -> Void)?
    var onSeed: ((_ id: String, _ cols: Int, _ rows: Int, _ data: String) -> Void)?
    var onControl: ((_ id: String, _ owner: ControlOwner?) -> Void)?
    var onExit: ((_ id: String, _ code: Int) -> Void)?
    var onProjects: (([Project]) -> Void)?
    var onSidebar: ((_ order: [String], _ groups: [ProjectFolder]) -> Void)?
    var onTerminals: ((_ project: String, _ terminals: [TerminalInfo]) -> Void)?
    var onSlash: ((_ id: String, _ commands: [SlashCommand]) -> Void)?
    var onUpload: ((_ id: String, _ path: String) -> Void)?
    var onMentions: ((_ project: String, _ entries: [MentionEntry]) -> Void)?
    var onHistory: ((_ project: String, _ rows: [HistoryRow]) -> Void)?
    var onStatus: ((_ project: String, _ entries: [StatusEntry]) -> Void)?
    var onDuplicateDefaults: ((_ excludeUncommitted: Bool, _ reinstallDeps: Bool, _ pullLatest: Bool) -> Void)?
    var onProjectsChanged: (() -> Void)?
    var onStatusChanged: ((_ project: String) -> Void)?
    // A duplicate/remove failed — the message to surface. Success is silent (the
    // `projects-changed` push refreshes the list on its own).
    var onActionError: ((_ message: String) -> Void)?

    private var endpoint: Endpoint
    private var credential: Credential?
    private var pairingCode: String?
    private var deviceName: String
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private let subscribed = NSMutableSet() // termIds we auto-re-sub on reconnect
    private(set) var state: State = .idle

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
    private let connectTimeout: TimeInterval = 10
    private let heartbeatInterval: TimeInterval = 20
    private let baseBackoff: TimeInterval = 1.5
    private let maxBackoff: TimeInterval = 20
    // After a few quick retries fail, stop pretending and surface an honest error
    // (while still retrying underneath), so the UI never spins forever.
    private let patientAttempts = 3

    static let offlineHint = "Can't reach your Mac. On cellular, make sure Tailscale is connected on both devices."

    struct Credential { let deviceId: String; let token: String }

    /// This device's id (once paired/authenticated), for comparing against a
    /// terminal's control owner.
    var deviceId: String? { credential?.deviceId }

    init(endpoint: Endpoint, credential: Credential?, deviceName: String) {
        self.endpoint = endpoint
        self.credential = credential
        self.deviceName = deviceName
        super.init()
        let config = URLSessionConfiguration.default
        // Fail fast on a dead path rather than waiting for connectivity — the
        // reconnect loop owns retrying, and the watchdog owns the connect timeout.
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = 30
        session = URLSession(configuration: config, delegate: nil, delegateQueue: nil)
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

    /// Force an immediate reconnect attempt (the "Retry" button) — skips any
    /// pending backoff wait.
    func retryNow() {
        cancelReconnect()
        wantConnected = true
        startAttempt()
    }

    func disconnect() {
        wantConnected = false
        cancelReconnect()
        teardownTask()
        set(.idle)
    }

    // MARK: connection lifecycle

    private func startAttempt() {
        guard let url = endpoint.url else { return fatal("bad host") }
        teardownTask()
        set(.connecting)
        let task = session.webSocketTask(with: url)
        self.task = task
        task.resume()
        // Handshake: pair if we have a one-time code, else auth with our token.
        if let code = pairingCode {
            send(Wire.pair(code: code, name: deviceName))
        } else if let c = credential {
            send(Wire.auth(deviceId: c.deviceId, token: c.token))
        } else {
            return fatal("no credential")
        }
        receiveLoop(task)
        startWatchdog()
    }

    /// Reached `ready` (or `paired`): the link is live. Clear backoff and start
    /// the heartbeat that keeps the tunnel warm and detects silent drops.
    private func onConnected() {
        retryAttempt = 0
        connectWatchdog?.cancel(); connectWatchdog = nil
        startHeartbeat()
    }

    /// A retryable failure — transport dropped, a send/ping failed, or the connect
    /// watchdog fired. Tears down and schedules a backoff retry (unless we've been
    /// intentionally disconnected).
    private func transientFailure(_ reason: String) {
        teardownTask()
        guard wantConnected else { return }
        scheduleReconnect(reason)
    }

    /// A terminal failure — the server rejected our auth/pairing, or the endpoint
    /// is unusable. Stop retrying; the user must act (re-pair / fix the address).
    private func fatal(_ msg: String) {
        wantConnected = false
        cancelReconnect()
        teardownTask()
        set(.failed(msg))
    }

    private func scheduleReconnect(_ reason: String) {
        guard wantConnected, reconnectWork == nil else { return }
        retryAttempt += 1
        let capped = min(baseBackoff * pow(2, Double(retryAttempt - 1)), maxBackoff)
        let delay = capped * Double.random(in: 0.85...1.15)
        // Stay hopeful ("connecting") for the first few fast retries; after that,
        // show the honest offline hint while the slow retries continue underneath.
        set(retryAttempt <= patientAttempts ? .connecting : .failed(Self.offlineHint))
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
                    self.transientFailure("ping timeout")
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
        stopHeartbeat()
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    // MARK: requests

    func requestProjects() { send(Wire.projects()) }
    func requestSidebar() { send(Wire.sidebar()) }
    func requestTerminals(project: String) { send(Wire.terminals(project: project)) }
    func requestSlash(id: String, project: String) { send(Wire.slash(id: id, project: project)) }
    func uploadImage(_ id: String, _ b64: String, mime: String) { send(Wire.upload(id: id, data: b64, mime: mime)) }
    func requestMentions(project: String) { send(Wire.mentions(project: project)) }
    func requestHistory(project: String, q: String) { send(Wire.history(project: project, q: q)) }
    func recordHistory(project: String, id: String, label: String, text: String) {
        send(Wire.historyAdd(project: project, id: id, label: label, text: text))
    }
    func requestStatus(project: String) { send(Wire.status(project: project)) }
    func runAction(project: String, action: String) { send(Wire.runAction(project: project, action: action)) }
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
    func startProject(_ name: String, profile: String = "") { send(Wire.start(name: name, profile: profile)) }
    func stopProject(_ name: String) { send(Wire.stop(name: name)) }
    func toggleService(_ name: String, service: String) { send(Wire.toggleService(name: name, service: service)) }

    func subscribe(_ id: String) {
        subscribed.add(id)
        send(Wire.sub(id: id))
    }
    func unsubscribe(_ id: String) {
        subscribed.remove(id)
        send(Wire.unsub(id: id))
    }
    func claim(_ id: String) { send(Wire.claim(id: id)) }
    func sendInput(_ id: String, _ data: String) { send(Wire.input(id: id, data: data)) }
    func resize(_ id: String, cols: Int, rows: Int) { send(Wire.resize(id: id, cols: cols, rows: rows)) }

    // MARK: plumbing

    private func send(_ text: String) {
        guard let t = task else { return }
        t.send(.string(text)) { [weak self] err in
            guard err != nil else { return }
            self?.main {
                guard let self, t === self.task else { return } // ignore a stale task's send
                self.transientFailure("send failed")
            }
        }
    }

    private func receiveLoop(_ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }
            self.main {
                guard task === self.task else { return } // a superseded task's callback
                switch result {
                case .failure:
                    self.transientFailure("disconnected")
                case .success(let message):
                    if case .string(let text) = message { self.handle(text) }
                    self.receiveLoop(task)
                }
            }
        }
    }

    /// Handle one inbound frame. Always called on the main queue (from receiveLoop).
    private func handle(_ text: String) {
        let frame = Wire.Inbound.parse(text)
        switch frame {
            case .paired(let deviceId, let token):
                self.credential = Credential(deviceId: deviceId, token: token)
                self.pairingCode = nil
                Keychain.save(deviceId: deviceId, token: token)
                self.set(.ready)
                self.onConnected()
                self.onProjectsChanged?()
            case .ready:
                self.set(.ready)
                self.onConnected()
                // Re-subscribe to any terminals we were watching before a drop.
                for id in self.subscribed { self.send(Wire.sub(id: id as! String)) }
            case .error(let e):
                self.fatal(e)
            case .projects(let p): self.onProjects?(p)
            case .sidebar(let order, let groups): self.onSidebar?(order, groups)
            case .terminals(let proj, let t): self.onTerminals?(proj, t)
            case .slash(let id, let cmds): self.onSlash?(id, cmds)
            case .upload(let id, let path): self.onUpload?(id, path)
            case .mentions(let proj, let entries): self.onMentions?(proj, entries)
            case .history(let proj, let rows): self.onHistory?(proj, rows)
            case .status(let proj, let s): self.onStatus?(proj, s)
            case .seed(let id, let c, let r, let d, let owner):
                self.onControl?(id, owner)
                self.onSeed?(id, c, r, d)
            case .control(let id, let owner): self.onControl?(id, owner)
            case .output(let id, let d): self.onOutput?(id, d)
            case .exit(let id, let code): self.onExit?(id, code)
            // A duplicate/remove reply lands only after the desktop finished the
            // folder clone/delete and rewrote its config, so a re-request is
            // guaranteed to reflect it — don't rely on the projects-changed push
            // alone (it can race the multi-second clone that blocks this socket).
            case .duplicateDefaults(let excl, let reinstall, let pull):
                self.onDuplicateDefaults?(excl, reinstall, pull)
            case .duplicate(_, let error):
                if let error { self.onActionError?(error) } else { self.onProjectsChanged?() }
            case .remove(let error):
                if let error { self.onActionError?(error) } else { self.onProjectsChanged?() }
            case .projectsChanged: self.onProjectsChanged?()
            case .statusChanged(let proj): self.onStatusChanged?(proj)
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
