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
    var onProjectsChanged: (() -> Void)?
    var onStatusChanged: ((_ project: String) -> Void)?

    private var endpoint: Endpoint
    private var credential: Credential?
    private var pairingCode: String?
    private var deviceName: String
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private let subscribed = NSMutableSet() // termIds we auto-re-sub on reconnect
    private(set) var state: State = .idle

    struct Credential { let deviceId: String; let token: String }

    /// This device's id (once paired/authenticated), for comparing against a
    /// terminal's control owner.
    var deviceId: String? { credential?.deviceId }

    init(endpoint: Endpoint, credential: Credential?, deviceName: String) {
        self.endpoint = endpoint
        self.credential = credential
        self.deviceName = deviceName
        super.init()
        session = URLSession(configuration: .default, delegate: nil, delegateQueue: nil)
    }

    /// Connect for a normal (already-paired) session.
    func connect() {
        guard let url = endpoint.url else { return set(.failed("bad host")) }
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
            return set(.failed("no credential"))
        }
        receiveLoop()
    }

    /// Connect to consume a one-time pairing code scanned from the desktop QR.
    func pair(host: String, port: Int, code: String) {
        endpoint = Endpoint(host: host, port: port)
        pairingCode = code
        connect()
    }

    func disconnect() {
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
        task?.send(.string(text)) { [weak self] err in
            if err != nil { self?.main { self?.set(.failed("send failed")) } }
        }
    }

    private func receiveLoop() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                self.main { self.set(.failed("disconnected")) }
            case .success(let message):
                if case .string(let text) = message { self.handle(text) }
                self.receiveLoop()
            }
        }
    }

    private func handle(_ text: String) {
        let frame = Wire.Inbound.parse(text)
        main {
            switch frame {
            case .paired(let deviceId, let token):
                self.credential = Credential(deviceId: deviceId, token: token)
                self.pairingCode = nil
                Keychain.save(deviceId: deviceId, token: token)
                self.set(.ready)
                self.onProjectsChanged?()
            case .ready:
                self.set(.ready)
                // Re-subscribe to any terminals we were watching before a drop.
                for id in self.subscribed { self.send(Wire.sub(id: id as! String)) }
            case .error(let e):
                self.set(.failed(e))
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
            case .projectsChanged: self.onProjectsChanged?()
            case .statusChanged(let proj): self.onStatusChanged?(proj)
            case .pong, .unknown: break
            }
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
