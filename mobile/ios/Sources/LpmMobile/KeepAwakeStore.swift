import Foundation

/// Keep awake on the live Mac. The Mac owns it; this mirrors what it reports and
/// asks it to change.
@Observable @MainActor
final class KeepAwakeStore {
    @ObservationIgnored weak var model: AppModel?

    private(set) var state: MacKeepAwake?
    /// When the set time or the after-agents countdown ends, on this phone's clock.
    private(set) var endsAt: Date?
    var error: String?

    func left(at now: Date) -> TimeInterval? {
        endsAt.map { max(0, $0.timeIntervalSince(now)) }
    }

    // MARK: from the Mac

    func noteReady(features: Set<String>) {
        guard features.contains(LpmClient.keepAwakeFeature) else {
            state = nil
            endsAt = nil
            return
        }
        model?.client?.keepAwake()
    }

    func apply(_ next: MacKeepAwake) {
        state = next
        endsAt = next.endsIn.map { Date().addingTimeInterval(Double($0) / 1000) }
    }

    func answered(_ next: MacKeepAwake?, error: String?) {
        if let next { apply(next) }
        self.error = error
    }

    func handleConnectionReset() {
        error = nil
    }

    // MARK: to the Mac

    func set(_ mode: MacKeepAwake.Mode, minutes: Int? = nil) {
        error = nil
        model?.client?.keepAwakeSet(mode: mode.rawValue, minutes: minutes)
    }
}
