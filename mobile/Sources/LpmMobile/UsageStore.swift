import Foundation

/// The agent plan-usage meters (the desktop Usage page): how much of each tool's
/// 5-hour and weekly window is spent. Owned by `AppModel` and reached as
/// `model.usage`; the client transport lives on `AppModel`.
///
/// The Mac answers `limits` inline from an in-memory store and pushes the whole
/// snapshot again whenever a tool reports new numbers, so a push replaces the
/// held snapshot outright rather than triggering another request.
@Observable @MainActor
final class UsageStore {
    @ObservationIgnored weak var model: AppModel?
    private var client: LpmClient? { model?.client }

    var snapshot: LimitsSnapshot?
    var loading = false
    var error: String?

    /// Millis to ADD to this phone's `Date()` to land on the Mac's clock. Only the
    /// Mac-stamped `updatedAt` belongs on that clock; a window's `resetsAt` is
    /// stamped by the tool's own servers and stays on the phone's. Zero when the
    /// Mac didn't say what time it was.
    private(set) var clockOffsetMs: Double = 0

    /// A moment on this phone read as the Mac would have read it, unix millis —
    /// for comparing against `updatedAt`, and nothing else.
    func macMillis(_ date: Date) -> Double {
        date.timeIntervalSince1970 * 1000 + clockOffsetMs
    }

    // True while the Usage screen is showing, so a reconnect replays the request
    // instead of leaving the screen on stale numbers.
    @ObservationIgnored private var active = false
    @ObservationIgnored private let timeout = GenerationTimeout<String>()

    // MARK: screen lifecycle

    func screenDidOpen() { load() }
    func screenDidClose() { active = false }

    /// Pull-to-refresh: re-request when live, else nudge the link back up.
    func refresh() async {
        if case .ready = model?.connection { load() }
        else { model?.reconnectIfNeeded() }
        try? await Task.sleep(nanoseconds: 500_000_000)
    }

    func load() {
        active = true
        loading = true
        error = nil
        client?.requestLimits()
        // A Mac too old to know this request never answers at all, and a reply can
        // also be lost while the socket stays up — give up rather than spin. A
        // reload keeps the numbers already on screen, but it still has to say so:
        // silently leaving hours-old percentages up reads as current.
        timeout.arm("limits", seconds: 20) { [weak self] in
            guard let self, self.loading else { return }
            self.loading = false
            self.error = usageGenericError
        }
    }

    // MARK: reply handlers (driven by AppModel.wireUsage)

    func apply(_ snapshot: LimitsSnapshot?, error: String?) {
        timeout.cancel("limits")
        loading = false
        if let snapshot {
            adopt(snapshot)
        } else {
            self.error = error ?? usageGenericError
        }
    }

    /// A tool reported new numbers. Fresh data settles whatever a request was
    /// waiting for, even when the reply itself never arrives — so it has to clear
    /// the spinner and any earlier failure as well as the timeout, or the screen
    /// stays dimmed over numbers that are in fact current.
    func applyPush(_ snapshot: LimitsSnapshot) {
        timeout.cancel("limits")
        loading = false
        adopt(snapshot)
    }

    private func adopt(_ snapshot: LimitsSnapshot) {
        self.snapshot = snapshot
        error = nil
        clockOffsetMs = snapshot.nowMs.map { $0 - Date().timeIntervalSince1970 * 1000 } ?? 0
    }

    /// The socket was replaced: nothing in flight can still answer, so drop the
    /// spinner and re-issue if the screen is still open.
    func handleConnectionReset() {
        timeout.cancelAll()
        loading = false
        if active { load() }
    }
}
