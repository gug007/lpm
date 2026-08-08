import Foundation
import CryptoKit

/// Registers this phone's push identity with the saved Macs the live session
/// isn't talking to.
///
/// A Mac only pushes to a device whose APNs token it holds, and the phone's live
/// socket reaches exactly one Mac at a time — so the registration that rides that
/// socket leaves every other saved Mac silent, and a notification-preference
/// change reaches only the Mac in front of you. This sweep opens a short-lived
/// connection to each *other* saved Mac, sends the same idempotent `apnsToken`
/// frame, and hangs up.
///
/// A Mac is skipped once it has acknowledged the current registration: the
/// acknowledged signature (token + environment + key + prefs) is remembered per
/// Mac, so a reachable Mac costs nothing after the first pass while an
/// unreachable one is simply retried on the next sweep.
@MainActor
final class PushRegistrar {
    /// Everything a Mac is told. Identical for every Mac — only the destination
    /// differs.
    struct Payload: Equatable {
        let token: String
        let env: String
        let key: String
        let waiting: Bool
        let done: Bool
        let error: Bool
        let automationStarted: Bool
        let automationDone: Bool
        let automationError: Bool
    }

    /// The state a sweep runs against, read fresh when it starts rather than when
    /// it was scheduled — the saved-Mac list and the prefs can both move during
    /// the coalescing delay. Nil means "nothing to register right now".
    struct Context {
        let macs: [MacRecord]
        /// The Mac the live session already registered with; never swept, so the
        /// sweep can't open a second socket to the Mac the user is looking at.
        let liveMacId: UUID?
        let payload: Payload
    }

    /// A Mac's identity learned from a sweep connection, so a Mac that has never
    /// been live on this phone can still be resolved from a notification's
    /// `serverId` (which is what routes a tap to the right Mac).
    var onIdentity: ((_ localId: UUID, _ serverId: String?, _ serverName: String?) -> Void)?

    // A burst of requests (each notification toggle fires one) collapses into a
    // single sweep this long after the last one.
    private static let coalesceDelay: TimeInterval = 1.5
    // Per-Mac budget from "start dialing" to "ack received". Generous: a Tailscale
    // path can take seconds to come up, and nothing is waiting on the result.
    private static let attemptTimeout: TimeInterval = 20
    private static let probeTimeout: TimeInterval = 6

    private let deviceName: String
    private var pending: Task<Void, Never>?
    // The registration connection currently in flight. Held here because nothing
    // else retains it: the client's callbacks and the watchdog are all weak, so a
    // dropped `Attempt` would strand its continuation forever. The sweep is
    // sequential, so one slot is enough.
    private var inFlight: Attempt?
    private var sweeping = false
    // Set when a sweep is requested while one is running: the prefs may have moved
    // under it, so run once more at the end rather than dropping the request.
    private var rerun = false

    init(deviceName: String) {
        self.deviceName = deviceName
    }

    /// Ask for a sweep. Cheap to call on every push-identity change — requests
    /// coalesce, and a Mac already holding this exact registration is skipped
    /// without opening anything.
    func schedule(_ context: @escaping @MainActor () -> Context?) {
        pending?.cancel()
        pending = Task { [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(Self.coalesceDelay * 1_000_000_000))
            guard !Task.isCancelled, let self else { return }
            self.launch(context)
        }
    }

    /// Drop a Mac's remembered registration, so the next sweep contacts it afresh.
    /// Called when a Mac is removed (the key would otherwise linger) and when one
    /// is re-paired (its device record on the Mac is new and holds no token).
    static func forget(_ localId: UUID) {
        UserDefaults.standard.removeObject(forKey: signatureKey(localId))
    }

    /// Record that a Mac already holds this registration. Called for the live
    /// session's own ack, so switching away from a Mac doesn't leave the sweep
    /// re-dialing the one that was just brought up to date over the socket.
    static func remember(_ payload: Payload, for localId: UUID) {
        storeSignature(signature(payload), for: localId)
    }

    /// Start a sweep, or note that another pass is owed if one is already running
    /// (the prefs may have moved under it). The sweep runs in a task of its own, so
    /// a later `schedule` — which cancels the pending debounce — can't cancel
    /// network work already in flight and make a reachable Mac look unreachable.
    private func launch(_ context: @escaping @MainActor () -> Context?) {
        guard !sweeping else {
            rerun = true
            return
        }
        sweeping = true
        Task { [weak self] in
            guard let self else { return }
            defer { self.sweeping = false }
            repeat {
                self.rerun = false
                await self.sweepOnce(context)
            } while self.rerun
        }
    }

    /// One pass over the saved Macs. Sequential: this is background work with
    /// nothing waiting on it, and one socket at a time keeps an unreachable Mac
    /// from turning the sweep into a burst of parallel dials.
    private func sweepOnce(_ context: @escaping @MainActor () -> Context?) async {
        guard let ctx = context() else { return }
        let signature = Self.signature(ctx.payload)
        for mac in ctx.macs where mac.localId != ctx.liveMacId {
            guard Self.storedSignature(mac.localId) != signature else { continue }
            if await register(mac, payload: ctx.payload) {
                Self.storeSignature(signature, for: mac.localId)
            }
        }
    }

    /// Register with one Mac. Returns whether the Mac acknowledged — false covers
    /// unreachable, refused (a credential it no longer honors), and timed out
    /// alike, none of which are worth surfacing: the sweep just retries later.
    private func register(_ mac: MacRecord, payload: Payload) async -> Bool {
        guard let credential = Keychain.load(for: mac.localId) else { return false }
        let port = Int(mac.port)
        guard let host = await HostProbe.firstReachable(mac.hosts, port: port,
                                                        timeout: Self.probeTimeout)
        else { return false }

        let attempt = Attempt(deviceName: deviceName, onIdentity: onIdentity)
        inFlight = attempt
        defer { inFlight = nil }
        return await withCheckedContinuation { continuation in
            attempt.start(host: host, port: port, credential: credential, mac: mac,
                          payload: payload, timeout: Self.attemptTimeout) { ok in
                continuation.resume(returning: ok)
            }
        }
    }

    // MARK: remembered registrations

    private static func signatureKey(_ localId: UUID) -> String {
        "lpm.push.registered.\(localId.uuidString)"
    }

    /// A digest of everything a Mac is told, so a Mac is re-contacted exactly when
    /// something it holds has changed. Hashed rather than stored plainly: the push
    /// key is a secret and UserDefaults is not a secret store.
    private static func signature(_ p: Payload) -> String {
        let bits = [p.waiting, p.done, p.error,
                    p.automationStarted, p.automationDone, p.automationError]
            .map { $0 ? "1" : "0" }
            .joined()
        let material = "\(p.token)|\(p.env)|\(p.key)|\(bits)"
        return SHA256.hash(data: Data(material.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func storedSignature(_ localId: UUID) -> String? {
        UserDefaults.standard.string(forKey: signatureKey(localId))
    }

    private static func storeSignature(_ signature: String, for localId: UUID) {
        UserDefaults.standard.set(signature, forKey: signatureKey(localId))
    }
}

/// One Mac's registration connection: dials, sends the frame once the session is
/// ready, and resolves exactly once — on the Mac's ack, on a terminal failure, or
/// on the watchdog — tearing the throwaway client down on the way out.
///
/// This client is never handed to the app: it subscribes to no terminals, watches
/// no projects, and takes control of nothing, so it can't disturb the live
/// session or the state the UI renders.
@MainActor
private final class Attempt {
    private let deviceName: String
    private let onIdentity: ((UUID, String?, String?) -> Void)?
    private var client: LpmClient?
    private var watchdog: DispatchWorkItem?
    private var completion: ((Bool) -> Void)?

    init(deviceName: String, onIdentity: ((UUID, String?, String?) -> Void)?) {
        self.deviceName = deviceName
        self.onIdentity = onIdentity
    }

    func start(host: String, port: Int, credential: LpmClient.Credential, mac: MacRecord,
               payload: PushRegistrar.Payload, timeout: TimeInterval,
               completion: @escaping (Bool) -> Void) {
        self.completion = completion
        let localId = mac.localId
        let c = LpmClient(endpoint: .init(host: host, port: port),
                          credential: credential,
                          deviceName: deviceName,
                          pinProvider: { Keychain.loadPin(for: localId) })
        client = c
        c.onState = { [weak self] state in
            switch state {
            case .ready: self?.send(payload)
            case .failed: self?.finish(false)
            case .idle, .connecting: break
            }
        }
        c.onApnsToken = { [weak self] ok in self?.finish(ok) }
        c.onIdentity = { [weak self] serverId, serverName in
            self?.onIdentity?(localId, serverId, serverName)
        }
        let w = DispatchWorkItem { [weak self] in self?.finish(false) }
        watchdog = w
        DispatchQueue.main.asyncAfter(deadline: .now() + timeout, execute: w)
        c.connect()
    }

    private func send(_ p: PushRegistrar.Payload) {
        client?.sendApnsToken(token: p.token, env: p.env, key: p.key,
                              notifyWaiting: p.waiting,
                              notifyDone: p.done,
                              notifyError: p.error,
                              notifyAutomationStarted: p.automationStarted,
                              notifyAutomationDone: p.automationDone,
                              notifyAutomationError: p.automationError)
    }

    private func finish(_ ok: Bool) {
        guard let completion else { return }
        self.completion = nil
        watchdog?.cancel()
        watchdog = nil
        // Drop the callbacks before tearing down: `shutdown()` sets the client to
        // `.idle`, which would otherwise re-enter `onState` on a dead attempt.
        client?.onState = nil
        client?.onApnsToken = nil
        client?.onIdentity = nil
        client?.shutdown()
        client = nil
        completion(ok)
    }
}
