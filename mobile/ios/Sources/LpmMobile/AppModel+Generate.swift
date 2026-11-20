import Foundation

extension AppModel {
    func wireGenerate(_ c: LpmClient) {
        c.onGenerateRequests = { [weak self, weak c] list in
            guard let self, let c, c === self.client else { return }
            self.generate.apply(list)
        }
        c.onAnswerGenerate = { [weak self, weak c] id, error in
            guard let self, let c, c === self.client else { return }
            self.generate.answered(id: id, error: error)
        }
    }
}
