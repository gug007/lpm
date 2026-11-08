import Foundation

/// A one-off link to a paired Mac for a share: dial its addresses at once, sign
/// in with this phone's credential, trade a few frames, hang up. The share
/// extension can't run the app's client, so this speaks just enough of the
/// protocol: `auth`, then requests answered one at a time. The certificate is
/// checked against the Mac's pin as the app's link does.
final class ShareMacLink: NSObject, URLSessionDelegate, @unchecked Sendable {
    enum Failure: Error {
        /// No address answered, or the link dropped or went quiet.
        case unreachable
        /// The Mac answered and said no: its `error`.
        case refused(String)
    }

    typealias Route = (_ host: String, _ port: Int) -> (host: String, port: Int)

    private static let signInTimeout: TimeInterval = 6

    private let pin: String?
    /// Guards `session` and `task`: a link racing others is closed from outside its own tasks.
    private let lock = NSLock()
    private var session: URLSession?
    private var task: URLSessionWebSocketTask?

    private init(pin: String?) {
        self.pin = pin
    }

    /// A signed-in link to whichever of `hosts` answers first, all dialed at once
    /// so an address that never answers doesn't hold up the others; the first
    /// answer settles it, a refusal included. `route` maps an address to the one
    /// to dial, as the app's built-in Tailscale does.
    static func open(hosts: [String], port: Int, credential: MacCredential, pin: String?, phoneId: String,
                     route: Route = { ($0, $1) }) async throws -> ShareMacLink {
        let links = hosts.filter { !$0.isEmpty }.compactMap { host -> ShareMacLink? in
            let target = route(host, port)
            guard let url = WssURL.make(host: target.host, port: target.port) else { return nil }
            let link = ShareMacLink(pin: pin)
            link.start(url)
            return link
        }
        let first = await withTaskGroup(of: (ShareMacLink, SignIn?).self) { group -> (ShareMacLink, SignIn)? in
            for link in links {
                group.addTask { (link, await link.signIn(credential, phoneId: phoneId)) }
            }
            for await (link, answer) in group {
                guard let answer else { continue }
                for other in links where other !== link { other.close() }
                return (link, answer)
            }
            return nil
        }
        guard case let (link, answer)? = first else { throw Failure.unreachable }
        if case .refused(let error) = answer {
            link.close()
            throw Failure.refused(error)
        }
        return link
    }

    private enum SignIn {
        case ready
        case refused(String)
    }

    /// The Mac's answer to this phone's `auth`; nil, and the link closed, when it
    /// gives none in time.
    private func signIn(_ credential: MacCredential, phoneId: String) async -> SignIn? {
        let auth: [String: Any] = ["t": "auth", "deviceId": credential.deviceId, "token": credential.token,
                                   "phoneId": phoneId]
        // A send waits for the socket to open, which an address that never
        // answers can hold up far longer than the sign-in timeout.
        Task { try? await send(auth) }
        guard let answer = try? await reply(timeout: Self.signInTimeout, where: {
            ["ready", "error"].contains($0["t"] as? String)
        }) else {
            close()
            return nil
        }
        return answer["t"] as? String == "ready" ? .ready : .refused(answer["error"] as? String ?? "unauthorized")
    }

    private func start(_ url: URL) {
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        let task = session.webSocketTask(with: url)
        task.maximumMessageSize = 32 * 1024 * 1024
        lock.withLock {
            self.session = session
            self.task = task
        }
        task.resume()
    }

    /// Send one frame; one still not out after `timeout` closes the link.
    func send(_ frame: [String: Any], timeout: TimeInterval = 30) async throws {
        guard let task = lock.withLock({ self.task }),
              let data = try? JSONSerialization.data(withJSONObject: frame),
              let text = String(data: data, encoding: .utf8) else { throw Failure.unreachable }
        let sent = await withTaskGroup(of: Bool.self) { group in
            group.addTask { (try? await task.send(.string(text))) != nil }
            group.addTask { [weak self] in
                do {
                    try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                } catch {
                    return false
                }
                self?.close()
                return false
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }
        if !sent { throw Failure.unreachable }
    }

    /// The next frame `matches` accepts, skipping whatever else the Mac pushes.
    /// Going quiet for `timeout` closes the link.
    func reply(timeout: TimeInterval = 30, where matches: @escaping ([String: Any]) -> Bool) async throws -> [String: Any] {
        let deadline = Date().addingTimeInterval(timeout)
        while true {
            let remaining = deadline.timeIntervalSinceNow
            guard remaining > 0, let frame = try await nextFrame(within: remaining) else { throw Failure.unreachable }
            if matches(frame) { return frame }
        }
    }

    private func nextFrame(within seconds: TimeInterval) async throws -> [String: Any]? {
        guard let task = lock.withLock({ self.task }) else { return nil }
        let message = try await withThrowingTaskGroup(of: URLSessionWebSocketTask.Message?.self) { group in
            group.addTask { try? await task.receive() }
            group.addTask { [weak self] in
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                self?.close()
                return nil
            }
            let first = try await group.next() ?? nil
            group.cancelAll()
            return first
        }
        guard case .string(let text)? = message, let data = text.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    func close() {
        lock.withLock {
            task?.cancel(with: .goingAway, reason: nil)
            session?.invalidateAndCancel()
            task = nil
            session = nil
        }
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let trust = challenge.protectionSpace.serverTrust,
              let fingerprint = CertPinning.leafFingerprint(trust),
              pin == nil || pin == fingerprint else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        completionHandler(.useCredential, URLCredential(trust: trust))
    }
}
