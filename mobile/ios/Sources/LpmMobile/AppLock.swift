import LocalAuthentication
import SwiftUI
import UIKit

/// The app's own lock, off unless turned on in Settings › Security: Face ID (or
/// the passcode) to open lpm Link after it has been away, and, separately, before
/// the actions that are hard to take back.
@Observable @MainActor
final class AppLock {
    static let shared = AppLock()

    static let enabledKey = "lpm.lock.enabled"
    static let afterKey = "lpm.lock.after"
    static let riskyKey = "lpm.lock.confirmRisky"
    /// Seconds away before it locks again.
    static let afterChoices = [0, 60, 300, 900]

    var enabled: Bool {
        didSet {
            UserDefaults.standard.set(enabled, forKey: Self.enabledKey)
            if !enabled { locked = false }
            updateCover()
        }
    }
    var after: Int {
        didSet { UserDefaults.standard.set(after, forKey: Self.afterKey) }
    }
    var confirmRisky: Bool {
        didSet { UserDefaults.standard.set(confirmRisky, forKey: Self.riskyKey) }
    }
    private(set) var locked: Bool {
        didSet { updateCover() }
    }
    /// The app isn't the active one: the app switcher's snapshot shows the cover.
    private var away = false {
        didSet { updateCover() }
    }

    @ObservationIgnored private var leftAt: Date?
    @ObservationIgnored private var unlocking = false
    @ObservationIgnored private var cover: UIWindow?

    private init() {
        let d = UserDefaults.standard
        enabled = d.bool(forKey: Self.enabledKey)
        after = d.object(forKey: Self.afterKey) as? Int ?? 0
        confirmRisky = d.bool(forKey: Self.riskyKey)
        locked = d.bool(forKey: Self.enabledKey)
    }

    /// What the phone checks with: "Face ID", "Touch ID", "Optic ID", or nil when
    /// the phone has no passcode at all (nothing to check against).
    var methodName: String? {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return nil }
        switch context.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        case .opticID: return "Optic ID"
        default: return "Passcode"
        }
    }

    func sceneChanged(_ phase: ScenePhase) {
        switch phase {
        case .active:
            away = false
            if enabled, let leftAt, Date().timeIntervalSince(leftAt) >= Double(after) { locked = true }
            leftAt = nil
            if locked { Task { await unlock() } }
        case .background:
            if leftAt == nil { leftAt = Date() }
            away = true
        default:
            away = true
        }
    }

    func unlock() async {
        guard locked, !unlocking else { return }
        unlocking = true
        defer { unlocking = false }
        if await Self.check("Unlock lpm Link") { locked = false }
    }

    /// Turn the lock on once the owner proves they can open it.
    func turnOn() async {
        if await Self.check("Turn on the lock for lpm Link") { enabled = true }
    }

    /// Runs `action` straight away, or once the owner confirms when risky actions
    /// ask first.
    func confirm(_ reason: String, then action: @escaping () -> Void) {
        guard confirmRisky else { return action() }
        Task {
            if await Self.check(reason) { action() }
        }
    }

    private static func check(_ reason: String) async -> Bool {
        let context = LAContext()
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil) else { return true }
        return (try? await context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason)) ?? false
    }

    /// Its own window above everything, sheets and the keyboard included.
    private func updateCover() {
        let show = locked || (enabled && away)
        if show, cover == nil {
            guard let scene = UIApplication.shared.connectedScenes
                .compactMap({ $0 as? UIWindowScene }).first else { return }
            let window = UIWindow(windowScene: scene)
            window.windowLevel = .alert + 1
            window.rootViewController = UIHostingController(rootView: AppLockCover(lock: self))
            window.isHidden = false
            cover = window
        } else if !show, let window = cover {
            window.isHidden = true
            cover = nil
        }
    }
}

extension AppModel {
    /// Stops every service in `project`, once the owner confirms when risky
    /// actions ask first (Android `ConfirmRisky.stopProject`).
    func confirmStop(_ project: Project) {
        AppLock.shared.confirm("Stop every service in \(project.name)") { self.stopProject(project) }
    }
}

struct AppLockCover: View {
    let lock: AppLock

    var body: some View {
        ZStack {
            Rectangle().fill(.regularMaterial).ignoresSafeArea()
            if lock.locked {
                VStack(spacing: 14) {
                    Image(systemName: "faceid")
                        .font(.system(size: 52, weight: .light))
                        .foregroundStyle(.tint)
                    Text("lpm Link is locked")
                        .font(.headline)
                    Text("Unlock to see your projects and terminals.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Button("Unlock with \(lock.methodName ?? "Face ID")") {
                        Task { await lock.unlock() }
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
                .padding(32)
            }
        }
    }
}

struct SecuritySection: View {
    @State private var lock = AppLock.shared

    var body: some View {
        let method = lock.methodName
        Section {
            Toggle("Require \(method ?? "Face ID")", isOn: Binding {
                lock.enabled
            } set: { on in
                if on { Task { await lock.turnOn() } } else { lock.enabled = false }
            })
            if lock.enabled {
                Picker("Lock", selection: $lock.after) {
                    ForEach(AppLock.afterChoices, id: \.self) { seconds in
                        Text(Self.afterLabel(seconds)).tag(seconds)
                    }
                }
            }
            Toggle("Confirm risky actions", isOn: $lock.confirmRisky)
        } header: {
            Text("Security")
        } footer: {
            Text(method == nil
                 ? "Set a passcode on this \(ThisDevice.noun) to lock lpm Link."
                 : "Confirm risky actions asks before Discard Changes, Push and Stop All.")
        }
        .disabled(method == nil)
    }

    static func afterLabel(_ seconds: Int) -> String {
        switch seconds {
        case 0: return "Immediately"
        case 60: return "After 1 minute"
        default: return "After \(seconds / 60) minutes"
        }
    }
}
