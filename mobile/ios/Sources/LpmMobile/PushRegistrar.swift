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
        let weeklyRecap: Bool
        /// Projects heard less about: "waiting" or "off", by project name.
        let projects: [String: String]
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
    var onIdentity: ((_ localId: UUID, _ serverId: String?, _ serverName: String?, _ platform: String?) -> Void)?

    // A burst of requests (each notification toggle fires one) collapses into a
    // single sweep this long after the last one.
    private static let coalesceDelay: TimeInterval = 1.5
    // Per-Mac budget from "start dialing" to "ack received". Generous: a Tailscale
    // path can take seconds to come up, and nothing is waiting on the result.
    private static let attemptTimeout: TimeInterval = 20

    private let deviceName: String
    private var pending: Task<Void, Never>?
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
        // A machine opened through another Mac doesn't know this phone.
        for mac in ctx.macs where mac.localId != ctx.liveMacId && mac.via == nil {
            guard Self.storedSignature(mac.localId) != signature else { continue }
            if await register(mac, payload: ctx.payload) {
                Self.storeSignature(signature, for: mac.localId)
            }
        }
    }

    /// Register with one Mac. Returns whether the Mac acknowledged — false covers
    /// unreachable, refused (a credential it no longer honors), and timed out
    /// alike, none of which are worth surfacing: the sweep just retries later.
    private func register(_ mac: MacRecord, payload p: Payload) async -> Bool {
        let localId = mac.localId
        let onIdentity = onIdentity
        return await MacErrand.run(
            to: mac, deviceName: deviceName, timeout: Self.attemptTimeout,
            onIdentity: { serverId, serverName, platform in
                onIdentity?(localId, serverId, serverName, platform)
            }
        ) { client, done in
            client.onApnsToken = done
            client.sendApnsToken(token: p.token, env: p.env, key: p.key,
                                 notifyWaiting: p.waiting,
                                 notifyDone: p.done,
                                 notifyError: p.error,
                                 notifyAutomationStarted: p.automationStarted,
                                 notifyAutomationDone: p.automationDone,
                                 notifyAutomationError: p.automationError,
                                 notifyWeeklyRecap: p.weeklyRecap,
                                 notifyProjects: p.projects)
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
                    p.automationStarted, p.automationDone, p.automationError, p.weeklyRecap]
            .map { $0 ? "1" : "0" }
            .joined()
        // Levels only when set, so a phone without any keeps the signature it had.
        let levels = p.projects.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: ",")
        let material = "\(p.token)|\(p.env)|\(p.key)|\(bits)" + (levels.isEmpty ? "" : "|\(levels)")
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
