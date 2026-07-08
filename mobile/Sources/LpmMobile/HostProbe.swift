import Foundation

/// Picks a reachable address for the Mac from the candidates the pairing QR
/// advertised (its LAN IP and, when present, its Tailscale IP). It races an
/// actual WebSocket open against each and returns the first to succeed, so the
/// phone lands on the LAN address at home and the Tailscale address away — from
/// one QR, with no manual entry and no fixed ordering penalty.
///
/// The probe opens a real `ws://host:port/` via URLSession — the exact transport
/// the live connection uses — rather than a raw `NWConnection`. That matters on
/// cellular: over a Tailscale tunnel a low-level `NWConnection` to the tailnet IP
/// often stalls in `.waiting` and never reports `.ready`, so it would wrongly
/// look unreachable and the phone would fall back to the (unroutable) LAN IP.
/// URLSession evaluates the VPN path correctly, matching the real connection.
enum HostProbe {
    static func firstReachable(_ hosts: [String], port: Int, timeout: TimeInterval = 4) async -> String? {
        let candidates = hosts.filter { !$0.isEmpty }
        guard candidates.count > 1 else { return candidates.first }

        return await withTaskGroup(of: String?.self) { group in
            for host in candidates {
                group.addTask { await opens(host, port: port, timeout: timeout) ? host : nil }
            }
            for await result in group {
                if let host = result {
                    group.cancelAll()
                    return host
                }
            }
            return nil
        }
    }

    /// True if a WebSocket handshake to `ws://host:port/` completes within the
    /// timeout. lpm answers the upgrade (101) before any auth, so a bare open is
    /// enough to prove the port is reachable; we tear the socket down immediately.
    private static func opens(_ host: String, port: Int, timeout: TimeInterval) async -> Bool {
        guard let url = URL(string: "ws://\(host):\(port)/") else { return false }
        let gate = OpenGate()
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = timeout
        let session = URLSession(configuration: config, delegate: gate, delegateQueue: nil)
        gate.bind(session)
        let task = session.webSocketTask(with: url)

        return await withTaskCancellationHandler {
            await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                gate.attach(cont)
                task.resume()
                DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { gate.finish(false) }
            }
        } onCancel: {
            gate.finish(false)
        }
    }
}

/// Resolves one probe's continuation exactly once, whichever of the WebSocket
/// open, a transport failure, the timeout, or task cancellation gets there
/// first, and tears the session down. `@unchecked Sendable` because access is
/// serialized by the lock, not the type system.
private final class OpenGate: NSObject, URLSessionWebSocketDelegate, URLSessionTaskDelegate, @unchecked Sendable {
    private var cont: CheckedContinuation<Bool, Never>?
    private var done = false
    private let lock = NSLock()
    private var session: URLSession?

    /// The session to tear down on finish. Held until `finish` so the timeout and
    /// cancellation paths (which fire before any delegate callback) can cancel it.
    func bind(_ s: URLSession) {
        lock.lock()
        session = s
        lock.unlock()
    }

    func attach(_ c: CheckedContinuation<Bool, Never>) {
        lock.lock()
        if done {
            lock.unlock()
            c.resume(returning: false)
            return
        }
        cont = c
        lock.unlock()
    }

    func finish(_ ok: Bool) {
        lock.lock()
        if done {
            lock.unlock()
            return
        }
        done = true
        let pending = cont
        let s = session
        cont = nil
        lock.unlock()
        s?.invalidateAndCancel()
        pending?.resume(returning: ok)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
        finish(true)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        finish(false)
    }
}
