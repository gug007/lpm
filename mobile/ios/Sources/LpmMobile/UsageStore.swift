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
    /// Today's spend per tool, for the usage rows' fallback when a tool has no
    /// window yet — the desktop sidebar's `useTokensToday`.
    var today: AgentStats?
    /// The Mac's limit reminders, kept in step as the desktop or any phone
    /// changes them.
    var reminders: [LimitReminder] = []

    var remindersSupported: Bool {
        client?.hostFeatures.contains(LpmClient.limitRemindersFeature) == true
    }

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
    // How many lists with usage rows are on screen; while any is, a usage push
    // also refreshes today's spend and the account pools.
    @ObservationIgnored private var rowViewers = 0
    @ObservationIgnored private var extrasAskedAt: Date?

    // MARK: usage rows (projects list, project screen)

    /// A list showing usage rows appeared, or the link came back under it: read
    /// the meters, today's spend and the accounts the rows are named and tagged by.
    func rowsDidAppear() {
        rowViewers += 1
        client?.requestLimits()
        refreshExtras()
    }

    func rowsDidDisappear() { rowViewers = max(0, rowViewers - 1) }

    /// Today's spend changes as agents work, and the pools move as switching
    /// picks another account, but neither is pushed. Scanning today's history and
    /// reading every account's login are cheap but not free, so they run at most
    /// every 30 seconds — sooner only when the accounts were never read.
    func refreshExtras() {
        let due = extrasAskedAt.map { Date().timeIntervalSince($0) >= 30 } ?? true
        if due {
            extrasAskedAt = Date()
            client?.requestStats(days: 1)
        }
        if due || model?.claudeAccounts == nil {
            client?.requestClaudeAccounts()
        }
        model?.tokenActivity.refreshIfDue()
    }

    func applyToday(_ stats: AgentStats) { today = stats }

    // MARK: screen lifecycle

    /// The cards are titled by the names accounts were given on the Mac, so the
    /// accounts are read too when nothing else has read them yet.
    func screenDidOpen() {
        load()
        if remindersSupported { client?.requestLimitReminders() }
        if model?.claudeAccounts == nil { client?.requestClaudeAccounts() }
    }
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
        // A push means an agent just reported work — the closest thing to a
        // "spend changed" signal there is.
        if rowViewers > 0 { refreshExtras() }
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
        if active {
            load()
            if remindersSupported { client?.requestLimitReminders() }
        }
    }

    // MARK: limit reminders

    /// The bell for one meter of the card whose limits are `limit` in the
    /// snapshot, or nil where the window doesn't offer one.
    func reminder(limit: String, window: String, win: LimitWindow?, name: String, now: Double) -> MeterReminder? {
        guard remindersSupported, let win else { return nil }
        let set = reminders.contains { $0.limit == limit && $0.window == window }
        guard LimitReminder.remindable(win, now: now, set: set) else { return nil }
        return MeterReminder(set: set) { [weak self] in
            guard let self else { return }
            Haptics.tap()
            if set {
                self.reminders.removeAll { $0.limit == limit && $0.window == window }
                self.client?.clearLimitReminder(limit: limit, window: window)
            } else {
                self.reminders.append(LimitReminder(limit: limit, window: window, resetsAt: win.resetsAt, name: name))
                self.client?.setLimitReminder(limit: limit, window: window, resetsAt: win.resetsAt, name: name)
            }
        }
    }

    func applyReminders(_ reminders: [LimitReminder], error: String?) {
        self.reminders = reminders
        if let error { model?.actionError = error }
    }
}
