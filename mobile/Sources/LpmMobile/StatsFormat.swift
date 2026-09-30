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
    let cacheWrite1h: Double
    let cacheRead: Double
    let output: Double
    let fast: Double
}

private func anthropic(_ input: Double, _ output: Double, cacheRead: Double? = nil, fast: Double = 2) -> Rate {
    Rate(input: input, cacheWrite: input * 1.25, cacheWrite1h: input * 2,
         cacheRead: cacheRead ?? input * 0.1, output: output, fast: fast)
}

/// OpenAI bills a cache write as plain input unless the model lists a write rate, and
/// has no 1-hour tier.
private func openai(_ input: Double, _ cacheRead: Double, _ output: Double,
                    cacheWrite: Double? = nil, fast: Double = 2) -> Rate {
    let write = cacheWrite ?? input
    return Rate(input: input, cacheWrite: write, cacheWrite1h: write,
                cacheRead: cacheRead, output: output, fast: fast)
}

private let opusRate = anthropic(5, 25)
private let codexRate = openai(4, 0.4, 20, cacheWrite: 5)

/// Substring tests matched in order, so a variant precedes its family — `claude-opus-5-5`
/// would otherwise be priced as Opus 5 (matches `RATE_TABLE` in statsCost.ts).
private let rateTable: [(tokens: [String], rate: Rate)] = [
    (["fable-5-1", "mythos-5-1"], anthropic(10, 50, cacheRead: 0.25)),
    (["mythos-preview"], anthropic(25, 125)),
    (["fable", "mythos"], anthropic(10, 50)),
    (["opus-5-5"], anthropic(4, 20, cacheRead: 0.2)),
    (["opus-4-6", "opus-4-7"], anthropic(5, 25, fast: 6)),
    (["opus-4-1", "opus-4-2025", "opus-4@"], anthropic(15, 75)),
    (["opus"], opusRate),
    (["sonnet-5"], anthropic(2, 10)),
    (["sonnet"], anthropic(3, 15)),
    (["3-5-haiku"], anthropic(0.8, 4)),
    (["haiku"], anthropic(1, 5)),
    (["gpt-6.1-sol"], openai(2, 0.1, 10, cacheWrite: 2.5)),
    (["gpt-6-astra"], openai(10, 1, 50, cacheWrite: 12.5)),
    (["gpt-6-sol"], openai(2, 0.2, 10, cacheWrite: 2.5)),
    (["gpt-6-luna"], openai(0.1, 0.01, 0.5, cacheWrite: 0.125)),
    (["gpt-5.6-terra"], openai(2, 0.2, 12, cacheWrite: 2.5)),
    (["gpt-5.6-luna"], openai(0.2, 0.02, 1.2, cacheWrite: 0.25)),
    (["gpt-5.6-cyber"], openai(12.5, 1.25, 75, cacheWrite: 15.625)),
    (["gpt-5.6"], codexRate),
    (["gpt-5.5-pro"], openai(30, 30, 180)),
    (["gpt-5.5"], openai(5, 0.5, 30, fast: 2.5)),
    (["gpt-5.4-mini"], openai(0.75, 0.075, 4.5)),
    (["gpt-5.4-nano"], openai(0.2, 0.02, 1.25)),
    (["gpt-5.4", "codex-auto-review"], openai(2.5, 0.25, 15)),
    (["gpt-5.3", "gpt-5.2"], openai(1.75, 0.175, 14)),
    (["gpt-5-mini"], openai(0.25, 0.025, 2, fast: 1.8)),
    (["gpt-5-nano"], openai(0.05, 0.005, 0.4)),
    (["gpt-5.1-codex-mini", "gpt-5-codex-mini"], openai(0.25, 0.025, 2)),
    (["gpt-5"], openai(1.25, 0.125, 10)),
    (["codex-mini"], openai(1.5, 0.375, 6)),
    (["o4-mini"], openai(1.1, 0.275, 4.4)),
    (["o3-mini"], openai(1.1, 0.55, 4.4)),
    (["o3"], openai(2, 0.5, 8, fast: 1.75)),
]

/// The first rate whose token appears (case-insensitive) in the model id, else the
/// provider's default (matches `pickRate` in statsCost.ts).
func pickRate(_ modelId: String, provider: String? = nil) -> Rate {
    let id = modelId.lowercased()
    for entry in rateTable where entry.tokens.contains(where: { id.contains($0) }) {
        return entry.rate
    }
    return provider == "codex" ? codexRate : opusRate
}

/// Estimated USD cost for one model's token usage. Fresh input is the input that
/// was neither a cache write nor a cache read; each bucket is priced separately, and
/// fast-mode usage is scaled by the model's fast multiplier.
func estimateModelCost(_ tokens: UsageTokens, _ modelId: String, provider: String? = nil,
                       fast: Bool = false) -> Double {
    let rate = pickRate(modelId, provider: provider)
    let freshInput = Double(max(0, tokens.inputTokens - tokens.cacheCreationInputTokens - tokens.cacheReadInputTokens))
    let cacheWrite1h = min(tokens.cacheCreation1hInputTokens, tokens.cacheCreationInputTokens)
    let cost = freshInput * rate.input
        + Double(tokens.cacheCreationInputTokens - cacheWrite1h) * rate.cacheWrite
        + Double(cacheWrite1h) * rate.cacheWrite1h
        + Double(tokens.cacheReadInputTokens) * rate.cacheRead
        + Double(tokens.outputTokens) * rate.output
    return cost * (fast ? rate.fast : 1) / 1_000_000
}

/// Summed estimated cost across every per-model breakdown.
func estimateTotalCost(_ models: [UsageBreakdown]) -> Double {
    models.reduce(0) { $0 + estimateModelCost($1.tokens, $1.key, provider: $1.provider, fast: $1.fast) }
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
