import Foundation

extension AppModel {
    func wireKeepAwake(_ c: LpmClient) {
        c.onKeepAwake = { [weak self, weak c] state in
            guard let self, let c, c === self.client else { return }
            self.keepAwake.apply(state)
        }
        c.onKeepAwakeSet = { [weak self, weak c] state, error in
            guard let self, let c, c === self.client else { return }
            self.keepAwake.answered(state, error: error)
        }
    }
}
