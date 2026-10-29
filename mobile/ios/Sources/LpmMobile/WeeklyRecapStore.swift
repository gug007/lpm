import Foundation

/// The weekly recap ("My agents' week", or month): last and this week's or
/// month's numbers from the Mac, which the phone draws into the desktop's card.
/// Owned by `AppModel` and reached as `model.weeklyRecap`.
///
/// The Mac reads the agents' history and asks GitHub off its socket, so a reply
/// takes seconds and names the week or month it answers.
@Observable @MainActor
final class WeeklyRecapStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    var pick = RecapPick(week: .last, period: .week)
    private(set) var recaps: [RecapPick: WeeklyRecap] = [:]
    private(set) var loading: Set<RecapPick> = []
    private(set) var errors: [RecapPick: String] = [:]

    @ObservationIgnored private var active = false
    @ObservationIgnored private let timeout = GenerationTimeout<RecapPick>()

    static let noAnswerError = "The Mac didn't answer."

    /// The screen opens on last week, the one that's over.
    func screenDidOpen() {
        active = true
        show(RecapPick(week: .last, period: .week))
    }

    func screenDidClose() { active = false }

    func show(_ pick: RecapPick) {
        self.pick = pick
        load(pick)
    }

    /// `fresh` reads the week again instead of taking the Mac's read from the
    /// last ten minutes.
    func load(_ pick: RecapPick, fresh: Bool = false) {
        loading.insert(pick)
        errors[pick] = nil
        client?.requestWeeklyRecap(pick, fresh: fresh)
        // A reload that never answers keeps the card already on screen.
        timeout.arm(pick, seconds: 30) { [weak self] in
            guard let self, self.loading.contains(pick) else { return }
            self.loading.remove(pick)
            if self.recaps[pick] == nil { self.errors[pick] = Self.noAnswerError }
        }
    }

    /// Pull to refresh: read the week again when live, else nudge the link back up.
    func refresh() async {
        if case .ready = model?.connection { load(pick, fresh: true) }
        else { model?.reconnectIfNeeded() }
        try? await Task.sleep(nanoseconds: 500_000_000)
    }

    func apply(_ pick: RecapPick, recap: WeeklyRecap?, error: String?) {
        timeout.cancel(pick)
        loading.remove(pick)
        if let recap {
            recaps[pick] = recap
            errors[pick] = nil
        } else {
            errors[pick] = error ?? "Couldn't read the \(pick.period.rawValue)."
        }
    }

    /// The socket was replaced: nothing in flight can still answer, so ask again
    /// while the screen is open.
    func handleConnectionReset() {
        timeout.cancelAll()
        loading = []
        if active { load(pick) }
    }
}
