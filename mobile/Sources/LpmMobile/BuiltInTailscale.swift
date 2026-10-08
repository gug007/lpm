import Foundation
import LpmTailnet
import Observation
import UIKit

/// lpm Link's built-in Tailscale node (`tailnet/ios` at the repo root, linked as
/// liblpmtailnet.a). It joins the user's tailnet as a device of its own, so the
/// phone reaches a Mac's tailnet address from any network with no Tailscale app.
///
/// The node lives in the app process, so iOS suspends it with the app; after a
/// long suspension its sockets are dead and it restarts on the way back. A
/// connection to a tailnet address goes through a short-lived loopback bridge
/// (`route`), so URLSession and certificate pinning work exactly as on the LAN.
@Observable @MainActor
final class BuiltInTailscale {
    static let shared = BuiltInTailscale()

    struct Status: Equatable, Decodable {
        var state = "off"
        var authURL: String?
        var ip: String?
        var dnsName: String?
        var account: String?
        var tailnet: String?
        var error: String?
        var version: UInt64 = 0
    }

    static let adminURL = URL(string: "https://login.tailscale.com/admin/machines")!

    private static let enabledKey = "builtInTailscale.enabled"
    private static let suspendedLongEnough: TimeInterval = 20
    private static let heartbeat: TimeInterval = 5

    private(set) var enabled: Bool
    private(set) var status = Status()
    private var started = false
    private var watcher: Thread?
    private var lastAwake: Date?
    private var heartbeatTimer: Timer?
    private var stateWhenBackgrounded: String?
    private let queue = DispatchQueue(label: "cx.lpm.tailnet")

    private init() {
        enabled = UserDefaults.standard.bool(forKey: Self.enabledKey)
    }

    var deviceName: String { "lpm-" + UIDevice.current.model.lowercased() }

    var isRunning: Bool { status.state == "running" }

    func setEnabled(_ on: Bool) {
        enabled = on
        UserDefaults.standard.set(on, forKey: Self.enabledKey)
        if on { start() } else { stop() }
    }

    /// Bring the node up when the app becomes active. A connected node that sat
    /// suspended has dead sockets, so it restarts. One the app kept awake in the
    /// background (read-aloud audio) is left alone, as is one mid sign-in: a
    /// restart would drop a live connection or abandon the pending sign-in.
    func foreground() {
        heartbeatTimer?.invalidate()
        heartbeatTimer = nil
        defer {
            lastAwake = nil
            stateWhenBackgrounded = nil
        }
        guard enabled else { return }
        if started, stateWhenBackgrounded == "running", let awake = lastAwake,
           Date().timeIntervalSince(awake) > Self.suspendedLongEnough {
            restart()
        } else {
            start()
        }
    }

    /// Note the moment the app leaves the foreground, and keep noting it for as
    /// long as the app keeps running: a gap on return means it was suspended.
    func background() {
        stateWhenBackgrounded = status.state
        lastAwake = Date()
        heartbeatTimer?.invalidate()
        heartbeatTimer = Timer.scheduledTimer(withTimeInterval: Self.heartbeat, repeats: true) { _ in
            MainActor.assumeIsolated { BuiltInTailscale.shared.lastAwake = Date() }
        }
    }

    /// Ask Tailscale for a sign-in page, turning the node on first if needed.
    /// Returns the page to open, or nil once the node is signed in (or waiting
    /// for an admin) without one. A node that needs signing in asks for the page
    /// itself as it starts, so this first waits for it to settle; only a node
    /// that was signed out is asked for a new page.
    func signIn() async throws -> URL? {
        if !enabled { setEnabled(true) }
        try await waitFor { $0.authURL != nil || !["off", "starting"].contains($0.state) }
        if status.state == "needsLogin" && status.authURL == nil {
            let failure: String? = await call { Self.take(LpmTailnetLogin()) }
            if let failure { throw TailnetError(message: failure) }
            try await waitFor { $0.authURL != nil || $0.state != "needsLogin" }
        }
        if let raw = status.authURL, let url = URL(string: raw) { return url }
        switch status.state {
        case "running", "needsApproval": return nil
        default: throw TailnetError(message: status.error ?? "Tailscale couldn't start. Try again in a moment.")
        }
    }

    private func waitFor(_ done: (Status) -> Bool) async throws {
        for _ in 0..<100 {
            if done(status) { return }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw TailnetError(message: "Tailscale didn't answer in time. Check your connection and try again.")
    }

    /// Sign out, which also removes this phone from the tailnet's device list.
    func signOut() async throws {
        let failure: String? = await call { Self.take(LpmTailnetLogout()) }
        if let failure { throw TailnetError(message: failure) }
    }

    private func start() {
        guard !started else { return }
        guard let dir = Self.stateDirectory() else {
            status = Status(state: "error", error: "Couldn't create a folder for Tailscale's keys.")
            return
        }
        started = true
        tailnetRouting.set(true)
        let name = deviceName
        queue.async {
            let failure = dir.path.withCString { d in name.withCString { h in Self.take(LpmTailnetStart(d, h)) } }
            guard let failure else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self.status = Status(state: "error", error: failure) }
            }
        }
        watch()
    }

    private func stop() {
        guard started else { return }
        started = false
        tailnetRouting.set(false)
        queue.async { LpmTailnetStop() }
    }

    /// Fresh connections for a node that sat suspended. The node reports itself
    /// starting throughout, so a connection made meanwhile waits for it.
    private func restart() {
        guard let dir = Self.stateDirectory() else { return }
        let name = deviceName
        queue.async {
            let failure = dir.path.withCString { d in name.withCString { h in Self.take(LpmTailnetRestart(d, h)) } }
            guard let failure else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self.status = Status(state: "error", error: failure) }
            }
        }
    }

    private func call<T>(_ body: @escaping @Sendable () -> T) async -> T {
        await withCheckedContinuation { cont in
            queue.async { cont.resume(returning: body()) }
        }
    }

    /// One long-lived thread parked in the node's status wait, publishing each
    /// change to the main actor.
    private func watch() {
        guard watcher == nil else { return }
        let thread = Thread {
            var version: UInt64 = 0
            while true {
                guard let raw = LpmTailnetWaitStatus(version, 30_000) else { continue }
                let json = String(cString: raw)
                LpmTailnetFree(raw)
                guard let next = try? JSONDecoder().decode(Status.self, from: Data(json.utf8)) else { continue }
                version = next.version
                tailnetRouting.set(next.state == "running" || next.state == "starting")
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { BuiltInTailscale.shared.status = next }
                }
            }
        }
        thread.name = "lpm-tailnet-status"
        thread.start()
        watcher = thread
    }

    private nonisolated static func take(_ raw: UnsafeMutablePointer<CChar>?) -> String? {
        guard let raw else { return nil }
        defer { LpmTailnetFree(raw) }
        return String(cString: raw)
    }

    private static func stateDirectory() -> URL? {
        guard let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }
        var dir = base.appendingPathComponent("tailnet", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            // The node's keys identify this phone; a backup restored onto another
            // phone would make two devices claim the same identity.
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try dir.setResourceValues(values)
        } catch {
            return nil
        }
        return dir
    }

    // MARK: routing

    /// Where to dial `host:port`: a fresh loopback bridge when it's a tailnet
    /// address and the node is up, else the address itself — a phone without
    /// the built-in node keeps reaching it through the Tailscale app.
    nonisolated static func route(host: String, port: Int) -> (host: String, port: Int) {
        guard tailnetRouting.get(), isTailnetHost(host) else { return (host, port) }
        let local = host.withCString { LpmTailnetBridge($0, Int32(port)) }
        return local > 0 ? ("127.0.0.1", Int(local)) : (host, port)
    }

    /// 100.64.0.0/10 or a MagicDNS name.
    nonisolated static func isTailnetHost(_ host: String) -> Bool {
        let parts = host.split(separator: ".")
        if parts.count == 4, let a = Int(parts[0]), let b = Int(parts[1]), parts.allSatisfy({ Int($0) != nil }) {
            return a == 100 && (64...127).contains(b)
        }
        return host.hasSuffix(".ts.net") || host.hasSuffix(".ts.net.")
    }
}

struct TailnetError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// Whether connections route through the node, readable from any thread.
private let tailnetRouting = RoutingFlag()

private final class RoutingFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false

    func get() -> Bool {
        lock.lock(); defer { lock.unlock() }
        return value
    }

    func set(_ v: Bool) {
        lock.lock(); value = v; lock.unlock()
    }
}
