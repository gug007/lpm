import StoreKit
import SwiftUI

/// When to ask for a rating: after the phone has done real work for someone (an
/// agent answered, a commit pushed, a pull request merged) five times, once per
/// version, never in Demo Mode. The system decides whether the prompt shows.
@Observable @MainActor
final class ReviewAsk {
    static let shared = ReviewAsk()

    static let winsBeforeAsking = 5
    private static let winsKey = "reviewAsk.wins"
    private static let askedVersionKey = "reviewAsk.askedVersion"

    private(set) var due = false
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let version: String

    init(defaults: UserDefaults = .standard,
         version: String = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") {
        self.defaults = defaults
        self.version = version
    }

    func win() {
        let wins = defaults.integer(forKey: Self.winsKey) + 1
        defaults.set(wins, forKey: Self.winsKey)
        if wins >= Self.winsBeforeAsking, defaults.string(forKey: Self.askedVersionKey) != version {
            due = true
        }
    }

    func asked() {
        due = false
        defaults.set(version, forKey: Self.askedVersionKey)
        defaults.set(0, forKey: Self.winsKey)
    }
}

extension AppModel {
    func noteWin() {
        guard !demoMode else { return }
        ReviewAsk.shared.win()
    }
}

/// Puts the system's rating prompt up a moment after a win makes one due.
struct ReviewAskPresenter: ViewModifier {
    @Environment(\.requestReview) private var requestReview
    @State private var ask = ReviewAsk.shared

    func body(content: Content) -> some View {
        content.task(id: ask.due) {
            guard ask.due else { return }
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            requestReview()
            ask.asked()
        }
    }
}
