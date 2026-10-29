import Foundation

/// Which week the recap covers: the one that ended last Sunday, or this one so far.
enum RecapWeek: String, CaseIterable {
    case last, this
}

/// What the recap covers: a week, Monday to Sunday, or a calendar month.
enum RecapPeriod: String, CaseIterable {
    case week, month
}

/// One recap the screen can show: last or this week or month.
struct RecapPick: Hashable {
    var week: RecapWeek
    var period: RecapPeriod
}

/// One week or month of agent work on the Mac and every computer it connects to
/// (the `weeklyRecap` reply's `recap`). Every field may be missing from an older Mac.
struct WeeklyRecap: Equatable {
    struct Day: Equatable {
        let date: String
        let agentMs: Int
        let prompts: Int
        /// Tokens read and written, as Stats counts them.
        let tokens: Int
    }

    /// Agent time on one project, or by one agent.
    struct Time: Equatable {
        let name: String
        let agentMs: Int
    }

    /// The Monday or the 1st it starts on, YYYY-MM-DD.
    let week: String
    let period: RecapPeriod
    let days: [Day]
    let previousAgentMs: Int
    let sessions: Int
    let projects: [Time]
    let agents: [Time]
    let workedRepos: [String]
    let linesAdded: Int
    let linesRemoved: Int
    /// Paired computers that couldn't add their week.
    let missing: [String]

    init(_ o: [String: Any]) {
        week = o["week"] as? String ?? ""
        period = RecapPeriod(rawValue: o["period"] as? String ?? "") ?? .week
        days = (o["days"] as? [[String: Any]] ?? []).map {
            Day(date: $0["date"] as? String ?? "", agentMs: recapInt($0, "agentMs"),
                prompts: recapInt($0, "prompts"), tokens: recapInt($0, "tokens"))
        }
        previousAgentMs = recapInt(o, "previousAgentMs")
        sessions = recapInt(o, "sessions")
        projects = Self.times(o["projects"])
        agents = Self.times(o["agents"])
        workedRepos = o["workedRepos"] as? [String] ?? []
        linesAdded = recapInt(o, "linesAdded")
        linesRemoved = recapInt(o, "linesRemoved")
        missing = o["missing"] as? [String] ?? []
    }

    private static func times(_ value: Any?) -> [Time] {
        (value as? [[String: Any]] ?? []).map {
            Time(name: $0["name"] as? String ?? "", agentMs: recapInt($0, "agentMs"))
        }
    }
}

/// A JSON number, bridged as NSNumber; 0 when missing.
private func recapInt(_ o: [String: Any], _ key: String) -> Int {
    (o[key] as? NSNumber)?.intValue ?? 0
}

/// YYYY-MM-DD days on the phone's calendar, Monday first, as the desktop's
/// statsDates counts them.
enum RecapDates {
    static let calendar = Calendar(identifier: .gregorian)

    private static let wire: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// Noon on `day`, clear of any daylight-saving jump.
    static func date(_ day: String) -> Date? {
        wire.date(from: day).flatMap { calendar.date(bySettingHour: 12, minute: 0, second: 0, of: $0) }
    }

    static func day(_ date: Date) -> String { wire.string(from: date) }

    static func today() -> String { day(Date()) }

    static func adding(_ days: Int, to day: String) -> String {
        guard let d = date(day), let moved = calendar.date(byAdding: .day, value: days, to: d) else { return day }
        return Self.day(moved)
    }

    /// 0 for Monday through 6 for Sunday.
    static func weekdayIndex(_ day: String) -> Int {
        guard let d = date(day) else { return 0 }
        return (calendar.component(.weekday, from: d) + 5) % 7
    }

    /// The Monday a recap of `week` starts on.
    static func weekStart(_ week: RecapWeek, today: String = today()) -> String {
        let monday = adding(-weekdayIndex(today), to: today)
        return week == .this ? monday : adding(-7, to: monday)
    }

    /// The day a recap of `pick` starts on: a Monday, or the 1st of the month.
    static func start(_ pick: RecapPick, today: String = today()) -> String {
        guard pick.period == .month else { return weekStart(pick.week, today: today) }
        let first = { (day: String) -> String in day.prefix(8) + "01" }
        let current = first(today)
        return pick.week == .this ? current : first(adding(-1, to: current))
    }
}
