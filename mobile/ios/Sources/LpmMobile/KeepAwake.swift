import Foundation

/// Keep awake on the Mac (`keepAwake` in PROTOCOL.md): kept awake while agents
/// work and for a while after, for a set time, or until turned off. The same
/// words as the Mac's own menu.
struct MacKeepAwake: Equatable {
    enum Mode: String, CaseIterable {
        case off, agents, timed, always
    }

    enum Power: String {
        case unsupported, idle, failed, awake, battery, low
    }

    var supported: Bool
    var mode: Mode
    var active: Bool
    var agents: Int
    /// Milliseconds until the set time or the after-agents countdown ends, as of
    /// when the frame arrived.
    var endsIn: Int?
    var tailMinutes: Int
    var floor: Int
    var power: Power

    init?(_ o: [String: Any]) {
        guard let mode = Mode(rawValue: o["mode"] as? String ?? "") else { return nil }
        self.mode = mode
        supported = o["supported"] as? Bool ?? true
        active = o["active"] as? Bool ?? false
        agents = o["agents"] as? Int ?? 0
        endsIn = o["endsIn"] as? Int
        tailMinutes = o["tailMinutes"] as? Int ?? 5
        floor = o["floor"] as? Int ?? 20
        power = Power(rawValue: o["power"] as? String ?? "") ?? .idle
    }

    static let presets = [30, 60, 120, 240, 480]
    /// What the menu adds to a set time that is running.
    static let extensions = [30, 60, 120]
    /// The longest set time the Mac takes: 99 hours 59 minutes.
    static let maxMinutes = 5999

    /// Holding now.
    var isOn: Bool { mode != .off && active }

    /// The short text beside the Mac's name: "2 agents", "1h 42m", "On".
    func badge(left: TimeInterval?) -> String? {
        switch mode {
        case .off: return nil
        case .agents:
            if agents > 0 { return agents == 1 ? "1 agent" : "\(agents) agents" }
            return left.map(Self.shortLeft) ?? "Agents"
        case .timed: return Self.shortLeft(left ?? 0)
        case .always: return "On"
        }
    }

    /// What holds and until when.
    func line(left: TimeInterval?, now: Date) -> String {
        switch mode {
        case .off:
            return "Sleeps on its usual schedule."
        case .agents:
            if agents > 0 {
                let working = agents == 1 ? "1 agent working." : "\(agents) agents working."
                return tailMinutes > 0
                    ? "\(working) Stays awake \(Self.span(tailMinutes)) after the last one finishes."
                    : "\(working) Can sleep as soon as the last one finishes."
            }
            if let left { return "Agents finished. Can sleep in \(Self.clock(left)) unless another one starts." }
            return "No agent is working. Stays awake when the next one starts."
        case .timed:
            let left = left ?? 0
            let until = now.addingTimeInterval(left).formatted(date: .omitted, time: .shortened)
            return "Awake until \(until) · \(Self.span(Int((left / 60).rounded(.up)))) left."
        case .always:
            return "Awake until you turn it off."
        }
    }

    /// Why it isn't held right now although a mode is on.
    func powerNote(macName: String) -> String? {
        guard mode != .off else { return nil }
        switch power {
        case .battery: return "On battery, so \(macName) can sleep. Turn on “On battery too” on the Mac to keep it awake."
        case .low: return "Battery at \(floor)% or less, so \(macName) can sleep."
        case .failed: return "Couldn't keep \(macName) awake. Turn it off and on to try again."
        default: return nil
        }
    }

    /// "4:32" or "1:29:58", rounded up so it reads 0:01 until the very end.
    static func clock(_ seconds: TimeInterval) -> String {
        let total = max(0, Int(seconds.rounded(.up)))
        let h = total / 3600, m = (total % 3600) / 60, s = total % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
    }

    /// "1h 42m", "42m", then "4:32" in the last ten minutes, as the Mac's
    /// sidebar says it.
    static func shortLeft(_ seconds: TimeInterval) -> String {
        if seconds <= 600 { return clock(seconds) }
        let minutes = Int((seconds / 60).rounded(.up))
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m)m" }
        return m == 0 ? "\(h)h" : "\(h)h \(m)m"
    }

    /// "45 min", "2 h", "1 h 30 min".
    static func span(_ minutes: Int) -> String {
        let h = minutes / 60, m = minutes % 60
        if h == 0 { return "\(m) min" }
        return m == 0 ? "\(h) h" : "\(h) h \(m) min"
    }

    /// A preset's menu title: "For 30 Minutes", "For 2 Hours".
    static func presetTitle(_ minutes: Int) -> String {
        if minutes < 60 { return "For \(minutes) Minutes" }
        let h = minutes / 60
        return h == 1 ? "For 1 Hour" : "For \(h) Hours"
    }

    /// An extension's menu title: "Add 30 Minutes", "Add 1 Hour", "Add 2 Hours".
    static func extendTitle(_ minutes: Int) -> String {
        if minutes < 60 { return "Add \(minutes) Minutes" }
        let h = minutes / 60
        return h == 1 ? "Add 1 Hour" : "Add \(h) Hours"
    }

    /// When the clock next shows `hour`:`minute`: today if that's still ahead,
    /// otherwise tomorrow.
    static func nextTime(hour: Int, minute: Int, after now: Date, calendar: Calendar = .current) -> Date {
        calendar.nextDate(after: now, matching: DateComponents(hour: hour, minute: minute, second: 0),
                          matchingPolicy: .nextTime) ?? now.addingTimeInterval(60)
    }

    /// The minutes a set time needs to last until `end`, rounded up and kept
    /// within what the Mac takes.
    static func minutes(until end: Date, from now: Date) -> Int {
        let minutes = Int((end.timeIntervalSince(now) / 60).rounded(.up))
        return min(max(minutes, 1), maxMinutes)
    }
}
