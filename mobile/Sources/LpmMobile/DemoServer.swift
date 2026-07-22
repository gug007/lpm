import Foundation

/// The in-process fake Mac hub behind a demo `LpmClient` (offline Demo Mode). It
/// parses the frames the client would have sent over the socket, dispatches each
/// to a per-domain handler, and pushes protocol-correct replies back through
/// `deliver` (wired to the client's `injectInbound`). A protocol-faithful
/// miniature of the real desktop hub, so every store, reqId match, and stale-reply
/// guard in the app runs unchanged.
///
/// Main-queue only: every client call originates on the main queue, and scripted
/// pushes use main-queue timers. No threading or `Date` exotica.
final class DemoServer {
    static let serverId = "demo-mac"
    static let serverName = "Demo Mac"
    static let deviceId = "demo-device"

    /// Delivers a reply frame into the client's inbound path. Set by the demo
    /// `LpmClient`.
    var deliver: ((String) -> Void)?

    /// All mutable demo state (see `DemoWorld`).
    var world = DemoWorld()

    private var handlers: [String: ([String: Any]) -> Void] = [:]

    init() {
        registerProjectsHandlers()
        registerTerminalsHandlers()
        registerGitHandlers()
        registerStatsHandlers()
        registerJobsHandlers()
        registerConfigHandlers()
    }

    /// Register a handler for an outbound verb (`t`). Called by each domain's
    /// `registerXxxHandlers()` at init.
    func register(_ t: String, _ handler: @escaping ([String: Any]) -> Void) {
        handlers[t] = handler
    }

    /// Parse one outbound frame and route it to its handler. Unknown verbs no-op.
    func receive(_ text: String) {
        guard let data = text.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let t = obj["t"] as? String else { return }
        handlers[t]?(obj)
    }

    // MARK: reply helpers

    /// JSON-encode and deliver a reply frame now.
    func push(_ obj: [String: Any]) {
        deliver?(Wire.json(obj))
    }

    /// Deliver a reply frame after a simulated delay.
    func pushAfter(_ seconds: Double, _ obj: [String: Any]) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            self?.push(obj)
        }
    }

    /// Deliver a reply frame built lazily after a delay, so it can reflect state at
    /// fire time. A nil result cancels the push.
    func pushAfter(_ seconds: Double, _ make: @escaping () -> [String: Any]?) {
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { [weak self] in
            guard let self, let obj = make() else { return }
            self.push(obj)
        }
    }
}
