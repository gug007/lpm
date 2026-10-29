import Foundation

/// What the recap card shows, by the desktop's rules (`recapView` in
/// weeklyRecapModel.ts). Never a project's name, so the card can be posted as it is.
struct RecapCardModel: Equatable {
    struct Tile: Equatable {
        let id: String
        let value: String
        let label: String
    }

    struct Slice: Equatable {
        let label: String
        let percent: Double
    }

    let title: String
    let range: String
    let hours: String
    /// Leads the card when the week has any.
    let tokens: String?
    let tiles: [Tile]
    let linesAdded: String
    let linesRemoved: String
    let mix: [Slice]
    let empty: Bool

    init(_ recap: WeeklyRecap) {
        let agentMs = recap.days.reduce(0) { $0 + $1.agentMs }
        let prompts = recap.days.reduce(0) { $0 + $1.prompts }
        let tokenCount = recap.days.reduce(0) { $0 + $1.tokens }

        title = recap.period == .month ? RecapCardStyle.monthTitle : RecapCardStyle.title
        range = recap.period == .month ? Self.monthLabel(recap.week) : Self.rangeLabel(recap.week)
        hours = formatAgentTime(agentMs)
        tokens = tokenCount > 0 ? formatTokenCount(tokenCount) : nil
        tiles = [
            Self.tile("prompts", prompts, "prompt", "prompts"),
            Self.tile("sessions", recap.sessions, "agent session", "agent sessions"),
        ]
        linesAdded = "+" + Self.compactCount(recap.linesAdded)
        linesRemoved = "−" + Self.compactCount(recap.linesRemoved)
        mix = Self.agentMix(recap.agents)
        empty = agentMs == 0
    }

    var mixText: String {
        if mix.count == 1 { return "All \(mix[0].label)" }
        return mix.map { "\($0.label) \(Int($0.percent.rounded()))%" }.joined(separator: ", ")
    }

    /// The words that go with the card when it's shared: only what the card shows.
    var caption: String {
        let counts = tiles.filter { $0.id == "prompts" }
            .map { "\($0.value) \($0.label)" }
        let lead = tokens.map { ["\($0) \(RecapCardStyle.tokensLabel)"] } ?? []
        return "\(title) in lpm: "
            + (lead + ["\(hours) \(RecapCardStyle.hoursLabel)"] + counts).joined(separator: ", ") + "."
    }

    private static let knownAgents = ["claude": "Claude", "codex": "Codex"]

    private static let rangeFormatter: DateIntervalFormatter = {
        let f = DateIntervalFormatter()
        f.dateTemplate = "MMMd"
        return f
    }()

    static func rangeLabel(_ first: String) -> String {
        guard let start = RecapDates.date(first),
              let end = RecapDates.date(RecapDates.adding(6, to: first)) else { return "" }
        return rangeFormatter.string(from: start, to: end)
    }

    private static let monthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.setLocalizedDateFormatFromTemplate("MMMMy")
        return f
    }()

    /// The month's name and year: "October 2026".
    static func monthLabel(_ first: String) -> String {
        RecapDates.date(first).map(monthFormatter.string) ?? ""
    }

    /// Each agent's share of the agent time, Claude and Codex by name.
    static func agentMix(_ agents: [WeeklyRecap.Time]) -> [Slice] {
        let total = agents.reduce(0) { $0 + $1.agentMs }
        guard total > 0 else { return [] }
        return agents.enumerated()
            .sorted { $0.element.agentMs != $1.element.agentMs
                ? $0.element.agentMs > $1.element.agentMs : $0.offset < $1.offset }
            .map { _, row in
                Slice(label: knownAgents[row.name] ?? row.name.prefix(1).uppercased() + row.name.dropFirst(),
                      percent: Double(row.agentMs) / Double(total) * 100)
            }
            .filter { $0.percent.rounded() > 0 }
    }

    private static func tile(_ id: String, _ count: Int, _ one: String, _ many: String) -> Tile {
        Tile(id: id, value: count.formatted(), label: count == 1 ? one : many)
    }

    /// Short enough for a quarter of the card: exact below 10,000, then
    /// thousands, then millions to one decimal.
    static func compactCount(_ count: Int) -> String {
        if count < 10_000 { return count.formatted() }
        let thousands = rounded(count, 1000)
        if thousands < 1000 { return "\(thousands)k" }
        // As JS's toFixed(1) rounds: the double's exact value, halves up.
        var exact = Decimal(string: String(format: "%.30f", Double(count) / 1_000_000)) ?? 0
        var tenths = Decimal()
        NSDecimalRound(&tenths, &exact, 1, .plain)
        return "\(tenths)M"
    }

    private static func rounded(_ value: Int, _ unit: Int) -> Int {
        Int((Double(value) / Double(unit)).rounded())
    }
}

/// Agent time as the desktop writes it: "45m", "3h", "54h 1m".
func formatAgentTime(_ ms: Int) -> String {
    let minutes = Int((Double(max(0, ms)) / 60_000).rounded())
    if minutes < 60 { return "\(minutes)m" }
    let rest = minutes % 60
    return rest > 0 ? "\(minutes / 60)h \(rest)m" : "\(minutes / 60)h"
}
