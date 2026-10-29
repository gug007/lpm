import Foundation

/// Demo handler for the weekly recap: the desktop demo's sample week
/// (desktop/frontend/src/demo/seed/sample/recap.ts), so both draw the same card.
/// A month is the sample week on repeat, each day by its weekday.
extension DemoServer {
    func registerRecapHandlers() {
        register("weeklyRecap") { [weak self] o in
            let thisWeek = o["week"] as? String == "this"
            let month = o["period"] as? String == "month"
            self?.pushAfter(0.6) {
                ["t": "weeklyRecap", "ok": true, "week": thisWeek ? "this" : "last", "period": month ? "month" : "week",
                 "recap": Self.sampleRecap(thisWeek: thisWeek, month: month)]
            }
        }
    }

    private static func sampleRecap(thisWeek: Bool, month: Bool) -> [String: Any] {
        let minute = 60_000
        // Agent minutes, prompts and millions of tokens per day, Monday first; Sunday off.
        let week = [(352, 38, 61), (418, 41, 74), (296, 33, 52), (389, 36, 68), (241, 29, 43), (184, 37, 32), (0, 0, 0)]
        let projects = [("saas-app", 0.41), ("auth-service", 0.24), ("docs-site", 0.16),
                        ("ml-pipeline", 0.12), ("mobile-app", 0.07)]
        let cal = Calendar(identifier: .gregorian)
        let today = cal.startOfDay(for: Date())
        let weekday = { (date: Date) in (cal.component(.weekday, from: date) + 5) % 7 }
        let first: Date
        let count: Int
        if month {
            let current = cal.date(from: cal.dateComponents([.year, .month], from: today)) ?? today
            first = thisWeek ? current : cal.date(byAdding: .month, value: -1, to: current) ?? current
            count = cal.range(of: .day, in: .month, for: first)?.count ?? 30
        } else {
            first = cal.date(byAdding: .day, value: -weekday(today) - (thisWeek ? 0 : 7), to: today) ?? today
            count = 7
        }
        let ymd = { (date: Date) -> String in
            let c = cal.dateComponents([.year, .month, .day], from: date)
            return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
        }
        let dates = (0..<count).map { cal.date(byAdding: .day, value: $0, to: first) ?? first }
        let total = dates.reduce(0) { $0 + week[weekday($1)].0 } * minute
        let weeks = Double(count) / 7
        let share = { (part: Double) in Int((Double(total) * part).rounded()) }
        return [
            "week": ymd(first),
            "period": month ? "month" : "week",
            // This week or month so far: nothing yet on the days still to come.
            "days": dates.map { date -> [String: Any] in
                let day = week[weekday(date)]
                let future = date > today
                return ["date": ymd(date), "agentMs": future ? 0 : day.0 * minute, "prompts": future ? 0 : day.1,
                        "tokens": future ? 0 : day.2 * 1_000_000]
            },
            "previousAgentMs": total - 7 * 60 * minute,
            "sessions": Int((58 * weeks).rounded()),
            "projects": projects.map { ["name": $0.0, "agentMs": share($0.1)] },
            "agents": [["name": "claude", "agentMs": share(0.64)], ["name": "codex", "agentMs": share(0.36)]],
            "workedRepos": ["github.com/acme/auth-service", "github.com/acme/ml-pipeline",
                            "github.com/acme/mobile-app", "github.com/acme/saas-app"],
            "linesAdded": Int((6_120 * weeks).rounded()),
            "linesRemoved": Int((2_407 * weeks).rounded()),
        ]
    }
}
