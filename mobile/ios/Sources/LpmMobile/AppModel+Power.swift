import Foundation

extension AppModel {
    func wirePower(_ c: LpmClient) {
        c.onPower = { [weak self, weak c] state in
            guard let self, let c, c === self.client else { return }
            self.power.apply(state)
        }
        c.onPowerSet = { [weak self, weak c] action, state, error in
            guard let self, let c, c === self.client else { return }
            self.power.answered(action, state: state, error: error)
        }
    }
}
