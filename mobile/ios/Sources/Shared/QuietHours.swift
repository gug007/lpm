import Foundation

/// Hours in which notifications arrive quietly: in the list, without a sound or
/// a banner. An agent waiting on the user can still come through. Kept in the
/// app group, since the notification extension decides each one as it arrives.
struct QuietHours: Equatable {
    var enabled = false
    /// Minutes after midnight, in the phone's own time zone.
    var start = 22 * 60
    var end = 7 * 60 + 30
    var letWaitingThrough = true

    private static let appGroup = "group.cx.lpm.mobile"
    static let enabledKey = "lpm.notify.quiet.enabled"
    static let startKey = "lpm.notify.quiet.start"
    static let endKey = "lpm.notify.quiet.end"
    static let waitingKey = "lpm.notify.quiet.waiting"

    private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

    static func load() -> QuietHours {
        var hours = QuietHours()
        guard let d = defaults else { return hours }
        hours.enabled = d.bool(forKey: enabledKey)
        if let start = d.object(forKey: startKey) as? Int { hours.start = start }
        if let end = d.object(forKey: endKey) as? Int { hours.end = end }
        if let waiting = d.object(forKey: waitingKey) as? Bool { hours.letWaitingThrough = waiting }
        return hours
    }

    func save() {
        guard let d = Self.defaults else { return }
        d.set(enabled, forKey: Self.enabledKey)
        d.set(start, forKey: Self.startKey)
        d.set(end, forKey: Self.endKey)
        d.set(letWaitingThrough, forKey: Self.waitingKey)
    }

    /// Whether `minute` (after midnight) falls in the quiet hours. A span that
    /// passes midnight (22:00–07:30) wraps; equal ends mean all day.
    func covers(minute: Int) -> Bool {
        guard enabled else { return false }
        if start == end { return true }
        return start < end ? (minute >= start && minute < end) : (minute >= start || minute < end)
    }

    /// Whether a notification about `status` arrives quietly at `date`. An agent
    /// waiting ("Waiting") and an automation asking ("Waiting for your answer · …")
    /// both need the user.
    func quiets(status: String, at date: Date, calendar: Calendar = .current) -> Bool {
        if letWaitingThrough && status.hasPrefix("Waiting") { return false }
        let parts = calendar.dateComponents([.hour, .minute], from: date)
        return covers(minute: (parts.hour ?? 0) * 60 + (parts.minute ?? 0))
    }
}
