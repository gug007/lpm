import Foundation

extension AppModel {
    /// The Mac answers `weeklyRecap`.
    var canShowWeeklyRecap: Bool {
        client?.hostFeatures.contains(LpmClient.weeklyRecapFeature) == true
    }

    /// The Mac answers `weeklyRecap` for a month.
    var canShowRecapMonth: Bool {
        client?.hostFeatures.contains(LpmClient.recapMonthFeature) == true
    }

    func wireWeeklyRecap(_ c: LpmClient) {
        c.onWeeklyRecap = { [weak self] pick, recap, error in
            self?.weeklyRecap.apply(pick, recap: recap, error: error)
        }
    }
}
