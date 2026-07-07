import Foundation
import Network

/// Picks a reachable address for the Mac from the candidates the pairing QR
/// advertised (its LAN IP and, when present, its Tailscale IP). It races a cheap
/// TCP connect against each and returns the first to succeed, so the phone lands
/// on the LAN address at home and the Tailscale address away — from one QR, with
/// no manual entry and no fixed ordering penalty.
enum HostProbe {
    static func firstReachable(_ hosts: [String], port: Int, timeout: TimeInterval = 2.5) async -> String? {
        let candidates = hosts.filter { !$0.isEmpty }
        guard candidates.count > 1 else { return candidates.first }

        return await withTaskGroup(of: String?.self) { group in
            for host in candidates {
                group.addTask { await reachable(host, port: port, timeout: timeout) ? host : nil }
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

    private static func reachable(_ host: String, port: Int, timeout: TimeInterval) async -> Bool {
        guard let nwPort = NWEndpoint.Port(rawValue: UInt16(port)) else { return false }
        let conn = NWConnection(host: NWEndpoint.Host(host), port: nwPort, using: .tcp)
        let gate = ProbeGate(conn)

        return await withTaskCancellationHandler {
            await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
                gate.attach(cont)
                conn.stateUpdateHandler = { state in
                    switch state {
                    case .ready: gate.finish(true)
                    case .failed, .cancelled: gate.finish(false)
                    default: break
                    }
                }
                DispatchQueue.global().asyncAfter(deadline: .now() + timeout) { gate.finish(false) }
                conn.start(queue: .global())
            }
        } onCancel: {
            gate.finish(false)
        }
    }
}

/// Resolves one probe's continuation exactly once, whichever of the connect
/// callback, the timeout, or task cancellation gets there first, and tears the
/// connection down. `@unchecked Sendable` because access is serialized by the
/// lock, not the type system.
private final class ProbeGate: @unchecked Sendable {
    private let conn: NWConnection
    private var cont: CheckedContinuation<Bool, Never>?
    private var done = false
    private let lock = NSLock()

    init(_ conn: NWConnection) { self.conn = conn }

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
        cont = nil
        lock.unlock()
        conn.cancel()
        pending?.resume(returning: ok)
    }
}
