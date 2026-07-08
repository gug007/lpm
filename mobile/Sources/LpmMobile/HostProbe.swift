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
    /// One host's probe result, with a short human-readable reason for diagnostics
    /// on the pairing screen (e.g. "100.92.155.108: refused").
    struct Outcome {
        let host: String
        let reachable: Bool
        let detail: String
    }

    /// Race all candidates; return the first reachable host (cancelling the rest),
    /// plus the outcomes gathered so far. When none are reachable, `winner` is nil
    /// and `outcomes` holds every host's failure reason. A single candidate skips
    /// the probe entirely — the live connection will exercise it directly.
    static func race(_ hosts: [String], port: Int, timeout: TimeInterval = 6) async -> (winner: String?, outcomes: [Outcome]) {
        let candidates = hosts.filter { !$0.isEmpty }
        guard candidates.count > 1 else { return (candidates.first, []) }

        return await withTaskGroup(of: Outcome.self) { group in
            for host in candidates {
                group.addTask { await open(host, port: port, timeout: timeout) }
            }
            var outcomes: [Outcome] = []
            for await r in group {
                outcomes.append(r)
                if r.reachable {
                    group.cancelAll()
                    return (r.host, outcomes)
                }
            }
            return (nil, outcomes)
        }
    }

    static func firstReachable(_ hosts: [String], port: Int, timeout: TimeInterval = 6) async -> String? {
        await race(hosts, port: port, timeout: timeout).winner
    }

    /// Probe one host. Reachability is signalled two ways, whichever fires first:
    /// the delegate's `didOpenWithProtocol`, and a `sendPing` round-trip — the
    /// ping also *drives* the connection, since a `URLSessionWebSocketTask` may
    /// not complete its handshake (or fire the open callback) until something is
    /// sent. lpm answers the WS upgrade before any auth, so a bare open proves the
    /// port is reachable; we tear the socket down as soon as either resolves.
    private static func open(_ host: String, port: Int, timeout: TimeInterval) async -> Outcome {
        guard let url = URL(string: "ws://\(host):\(port)/") else {
            return Outcome(host: host, reachable: false, detail: "bad address")
        }
        let gate = OpenGate()
        let config = URLSessionConfiguration.ephemeral
        config.waitsForConnectivity = false
        config.timeoutIntervalForRequest = timeout
        let session = URLSession(configuration: config, delegate: gate, delegateQueue: nil)
        gate.bind(session)
        let task = session.webSocketTask(with: url)

        let detail = await withTaskCancellationHandler {
            await withCheckedContinuation { (cont: CheckedContinuation<String, Never>) in
                gate.attach(cont)
                task.resume()
                task.sendPing { error in gate.finish(error == nil ? "ok" : shortReason(error)) }
                DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { gate.finish("timed out") }
            }
        } onCancel: {
            gate.finish("cancelled")
        }
        return Outcome(host: host, reachable: detail == "ok" || detail == "open", detail: detail)
    }
}

/// A short, human-readable label for a URLSession failure, for the on-phone
/// diagnostic ("refused" vs "no route" vs "timed out" tells LAN-blocked apart
/// from Tailscale-down at a glance).
private func shortReason(_ error: Error?) -> String {
    guard let e = error as NSError? else { return "failed" }
    switch e.code {
    case NSURLErrorCannotConnectToHost: return "refused"
    case NSURLErrorAppTransportSecurityRequiresSecureConnection: return "blocked (ATS)"
    case NSURLErrorTimedOut: return "timed out"
    case NSURLErrorNetworkConnectionLost: return "connection lost"
    case NSURLErrorCannotFindHost, NSURLErrorDNSLookupFailed: return "no route"
    case NSURLErrorNotConnectedToInternet: return "phone offline"
    default: return "failed (\(e.code))"
    }
}

/// Resolves one probe's continuation exactly once, whichever of the WebSocket
/// open, the ping round-trip, a transport failure, the timeout, or task
/// cancellation gets there first, and tears the session down. `@unchecked
/// Sendable` because access is serialized by the lock, not the type system.
private final class OpenGate: NSObject, URLSessionWebSocketDelegate, URLSessionTaskDelegate, @unchecked Sendable {
    private var cont: CheckedContinuation<String, Never>?
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

    func attach(_ c: CheckedContinuation<String, Never>) {
        lock.lock()
        if done {
            lock.unlock()
            c.resume(returning: "cancelled")
            return
        }
        cont = c
        lock.unlock()
    }

    func finish(_ detail: String) {
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
        pending?.resume(returning: detail)
    }

    func urlSession(_ session: URLSession, webSocketTask: URLSessionWebSocketTask, didOpenWithProtocol proto: String?) {
        finish("open")
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        finish(shortReason(error))
    }
}
