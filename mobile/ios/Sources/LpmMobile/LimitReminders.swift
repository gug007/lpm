import Foundation

/// A reminder that a usage limit has reset, kept by the Mac for its desktop and
/// every phone — the port of the desktop's `limitReminders.ts`.
struct LimitReminder: Equatable {
    let limit: String
    let window: String
    let resetsAt: Int
    let name: String

    init(limit: String, window: String, resetsAt: Int, name: String) {
        self.limit = limit
        self.window = window
        self.resetsAt = resetsAt
        self.name = name
    }

    init?(_ o: [String: Any]) {
        guard let limit = o["limit"] as? String, let window = o["window"] as? String else { return nil }
        self.init(limit: limit, window: window, resetsAt: o["resetsAt"] as? Int ?? 0,
                  name: o["name"] as? String ?? "")
    }

    static let fiveHour = "fiveHour"
    static let weekly = "weekly"

    /// Usage from which a window offers the reminder.
    static let remindFromPercent = 80.0

    /// A live reading near or at its limit, or one that already has a reminder.
    static func remindable(_ win: LimitWindow?, now: Double, set: Bool) -> Bool {
        guard let win, win.resetsAt > 0, Double(win.resetsAt) * 1000 > now else { return false }
        return set || win.usedPercent >= remindFromPercent
    }
}

/// The bell on one meter: whether its reminder is set, and what a tap does.
struct MeterReminder {
    let set: Bool
    let toggle: () -> Void
}
