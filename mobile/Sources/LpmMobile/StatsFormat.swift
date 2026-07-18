import Foundation
import SwiftUI

/// Pure formatting and derivation helpers for the Stats screen, ported from the
/// desktop app so the numbers match exactly:
///   - `agentUsageFormat.ts`       → token/percent/date/period formatting
///   - `components/stats/statsDerive.ts` → provider metadata + share math
///   - `components/stats/statsCost.ts`   → per-model cost estimation
///
/// These operate on the `Usage*` / `AgentStats` model types declared in
/// LpmProtocol.swift.

// MARK: - Token / percent / date formatting

/// Compact token count: `<1K` grouped, then `K` / `M` / `B` with one decimal
/// while the mantissa is small (matches `formatTokenCount` in the desktop).
func formatTokenCount(_ value: Int) -> String {
    let v = Double(value)
    if value < 1_000 { return value.formatted() }
    if value < 1_000_000 {
        return String(format: value < 10_000 ? "%.1fK" : "%.0fK", v / 1_000)
    }
    if value < 1_000_000_000 {
        return String(format: value < 10_000_000 ? "%.1fM" : "%.0fM", v / 1_000_000)
    }
    return String(format: value < 10_000_000_000 ? "%.1fB" : "%.0fB", v / 1_000_000_000)
}

/// The prose name for a selected period, used in "Nothing in …" copy.
func usagePeriodLabel(_ days: Int) -> String {
    if days == 1 { return "today" }
    if days == 0 { return "all time" }
    return "the last \(days) days"
}

/// A "YYYY-MM-DD" bucket rendered as e.g. "Jul 15" in the viewer's locale. The
/// desktop pins the instant to local noon to dodge timezone date-rollover.
func shortUsageDate(_ date: String) -> String {
    guard let parsed = parseUsageDate(date) else { return date }
    return parsed.formatted(.dateTime.month(.abbreviated).day())
}

/// Parse a "YYYY-MM-DD" bucket to a local-noon `Date` (nil on malformed input).
func parseUsageDate(_ date: String) -> Date? {
    let parts = date.split(separator: "-")
    guard parts.count == 3,
          let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2])
    else { return nil }
    var comps = DateComponents()
    comps.year = year
    comps.month = month
    comps.day = day
    comps.hour = 12
    return Calendar.current.date(from: comps)
}

/// A fraction (0…1) as a percent string; non-finite input reads as "0%".
func formatPercent(_ frac: Double, dp: Int = 0) -> String {
    guard frac.isFinite else { return "0%" }
    return String(format: "%.\(dp)f%%", frac * 100)
}

/// A relative time for a unix-**milliseconds** timestamp, e.g. "2 days ago" /
/// "yesterday". Session `startedAt`/`lastAt` are millis (Rust `timestamp_millis`),
/// matching the desktop, which divides by 1000 before its seconds-based helper.
func relativeUsageTime(_ unixMillis: Int) -> String {
    Date(timeIntervalSince1970: TimeInterval(unixMillis) / 1000)
        .formatted(.relative(presentation: .named))
}

// MARK: - Provider metadata + share math

struct ProviderMeta {
    let label: String
    let short: String
    let color: Color
}

/// Display metadata for a provider key; unknown keys fall back to the raw key
/// and a muted color (matches `providerMeta` in statsDerive.ts).
func providerMeta(_ key: String) -> ProviderMeta {
    switch key {
    case "claude": return ProviderMeta(label: "Claude Code", short: "Claude", color: Color(hex: "#D97757"))
    case "codex": return ProviderMeta(label: "Codex", short: "Codex", color: Color(hex: "#10A37F"))
    default: return ProviderMeta(label: key, short: key, color: .secondary)
    }
}

/// Share of input tokens served from cache (0…1).
func cacheShare(_ t: UsageTokens) -> Double {
    Double(t.cachedInputTokens) / Double(max(1, t.inputTokens))
}

/// Share of output tokens spent on reasoning (0…1).
func reasoningShare(_ t: UsageTokens) -> Double {
    Double(t.reasoningTokens) / Double(max(1, t.outputTokens))
}

/// The day with the most total tokens (nil if every day is empty).
func mostActiveDay(_ daily: [UsageDaily]) -> UsageDaily? {
    var peak: UsageDaily?
    for day in daily where day.totalTokens > 0 {
        if peak == nil || day.totalTokens > peak!.totalTokens { peak = day }
    }
    return peak
}

/// Count of distinct models seen across the given sessions.
func distinctModelCount(_ sessions: [UsageSession]) -> Int {
    Set(sessions.map(\.model)).count
}

// MARK: - Cost estimation

struct Rate {
    let input: Double
    let cacheWrite: Double
    let cacheRead: Double
    let output: Double
}

private let opusRate = Rate(input: 5, cacheWrite: 6.25, cacheRead: 0.5, output: 25)

private let rateTable: [(tokens: [String], rate: Rate)] = [
    (["fable", "mythos"], Rate(input: 10, cacheWrite: 12.5, cacheRead: 1.0, output: 50)),
    (["opus"], opusRate),
    (["sonnet"], Rate(input: 3, cacheWrite: 3.75, cacheRead: 0.3, output: 15)),
    (["haiku"], Rate(input: 1, cacheWrite: 1.25, cacheRead: 0.1, output: 5)),
    (["gpt", "codex", "o3", "o4", "o1"], Rate(input: 1.25, cacheWrite: 1.25, cacheRead: 0.125, output: 10)),
]

/// The first rate whose token appears (case-insensitive) in the model id, or the
/// Opus rate as the default (matches `pickRate` in statsCost.ts).
func pickRate(_ modelId: String) -> Rate {
    let id = modelId.lowercased()
    for entry in rateTable where entry.tokens.contains(where: { id.contains($0) }) {
        return entry.rate
    }
    return opusRate
}

/// Estimated USD cost for one model's token usage. Fresh input is the input that
/// was neither a cache write nor a cache read; each bucket is priced separately.
func estimateModelCost(_ tokens: UsageTokens, _ modelId: String) -> Double {
    let rate = pickRate(modelId)
    let freshInput = Double(max(0, tokens.inputTokens - tokens.cacheCreationInputTokens - tokens.cacheReadInputTokens))
    let cost = freshInput * rate.input
        + Double(tokens.cacheCreationInputTokens) * rate.cacheWrite
        + Double(tokens.cacheReadInputTokens) * rate.cacheRead
        + Double(tokens.outputTokens) * rate.output
    return cost / 1_000_000
}

/// Summed estimated cost across every per-model breakdown.
func estimateTotalCost(_ models: [UsageBreakdown]) -> Double {
    models.reduce(0) { $0 + estimateModelCost($1.tokens, $1.key) }
}

/// USD for display: `$0` at or below zero, two decimals under $10, else a rounded
/// grouped integer (matches `formatUsd` in statsCost.ts).
func formatUsd(_ value: Double) -> String {
    if value <= 0 { return "$0" }
    if value < 10 { return String(format: "$%.2f", value) }
    return "$" + Int(value.rounded()).formatted()
}

// MARK: - Color(hex:)

extension Color {
    /// Build a color from a `#rrggbb` (or `rrggbb`) hex string; malformed input
    /// falls back to gray so a bad literal can't crash a view.
    init(hex: String) {
        let raw = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var rgb: UInt64 = 0
        guard raw.count == 6, Scanner(string: raw).scanHexInt64(&rgb) else {
            self = .gray
            return
        }
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}
