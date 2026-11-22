import Foundation

/// Lock or sleep on the live Mac. The Mac owns whether it sleeps once its agents
/// finish; this mirrors what it reports and asks it to act.
@Observable @MainActor
final class PowerStore {
    @ObservationIgnored weak var model: AppModel?

    private(set) var state: MacPower?

    // MARK: from the Mac

    func noteReady(features: Set<String>) {
        guard features.contains(LpmClient.powerFeature) else {
            state = nil
            return
        }
        model?.client?.power()
    }

    func apply(_ next: MacPower) {
        state = next
    }

    func answered(_ action: MacPower.Action, state next: MacPower?, error: String?) {
        if let next { state = next }
        if let error {
            model?.actionError = error
        } else if action != .sleepWhenIdle {
            Haptics.success()
        }
    }

    // MARK: to the Mac

    func lock() { model?.client?.lockScreen() }
    func sleepNow() { model?.client?.sleepNow() }
    func sleepWhenIdle(_ on: Bool) { model?.client?.sleepWhenIdle(on) }
}
