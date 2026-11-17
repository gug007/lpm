import SwiftUI

/// One line of the usage rows under the projects list and a project's screen —
/// the port of the desktop sidebar's `usageRows` (sidebarUsage.ts): one line per
/// agent CLI, or per Claude account once more than one is in play, with when its
/// window comes back over a bar of how much of it is gone.
struct UsageRow: Identifiable {
    /// The account for a Claude row ("claude:<id>"), the tool otherwise.
    let id: String
    let provider: String
    let label: String
    /// The account's signed-in email, for the expanded card.
    let subtitle: String?
    let color: Color
    /// The calm limit tint when a window is known, the tool's own color when the
    /// row only reports what it spent today.
    let fill: Color
    let fraction: Double
    /// How far through its window the clock is (0…1), where the pace tick sits.
    let pace: Double?
    /// When the window resets, today's spend without a window, or a dash.
    let detail: String
    let percentText: String
    let windowLabel: String
    /// "5h" beside the reset when the numbers are about the 5-hour window;
    /// empty for the weekly one, which needs no label.
    let windowShort: String
    /// The other window, drawn as the thin lane under the row's own; nil for a
    /// row that only reports today's spend, or whose plan has no 5-hour window,
    /// and draws a single bar.
    let lane: UsageLane?
    /// The other window's name and use, read out in place of its lane.
    let laneText: String
    let tokens: Int
    let sessions: Int
    let data: ProviderLimits?
    let stale: Bool

    /// The Claude account this row is about, as its limits key; nil for a tool row.
    var account: String? {
        id.hasPrefix("claude:") ? String(id.dropFirst("claude:".count)) : nil
    }

    /// "1.2M spent today · 3 sessions", or nil when nothing was spent.
    var spentLine: String? {
        guard tokens > 0 else { return nil }
        let count = sessions == 1 ? "1 session" : "\(sessions) sessions"
        return "\(formatTokenCount(tokens)) spent today · \(count)"
    }
}

/// One window as a lane of a usage row's track.
struct UsageLane {
    let fraction: Double
    let fill: Color

    static let empty = UsageLane(fraction: 0, fill: .clear)
}

private let usageTools = ["claude", "codex"]

private struct UsageIdentity {
    let id: String
    let name: String
    var subtitle: String?
    var data: ProviderLimits?
}

/// One row per agent CLI — or per Claude account, once more than one is in play —
/// in a fixed order so rows never swap places under a finger. A tool appears once
/// it has a usage window or has spent something today.
///
/// `now` is the phone's clock, against which the tools' own `resetsAt` stamps are
/// judged; `macNow` is the Mac's, for the `updatedAt` it stamped.
func usageRows(_ snapshot: LimitsSnapshot?, today: AgentStats?, accounts: [ClaudeAccountInfo],
               now: Double, macNow: Double) -> [UsageRow] {
    let entries = snapshot.map { Array($0.entries.values) } ?? []

    struct Candidate {
        let provider: String
        let identity: UsageIdentity
        let split: Bool
        let reading: UsageReading
        let tokens: Int
        let sessions: Int
    }

    var candidates: [Candidate] = []
    for provider in usageTools {
        let identities = identitiesFor(provider, entries: entries, accounts: accounts)
        let split = identities.count > 1
        // The day's spend is counted per tool, not per account, so it only stands
        // in for a tool that shows a single row.
        let spent: UsageBreakdown? = split ? nil : today?.providers.first { $0.key == provider }
        for identity in identities {
            let reading = UsageReading(weekly: identity.data?.weekly, fiveHour: identity.data?.fiveHour,
                                       noFiveHour: identity.data?.noFiveHour ?? false, now: now)
            let candidate = Candidate(provider: provider, identity: identity, split: split, reading: reading,
                                      tokens: spent?.tokens.totalTokens ?? 0, sessions: spent?.sessions ?? 0)
            // An account row stays even with nothing to show — a row that vanished
            // when an account went idle would read as the account being gone.
            if reading.hasWindow || candidate.tokens > 0 || split { candidates.append(candidate) }
        }
    }

    // Rows without a window are measured against each other: no plan publishes a
    // token budget to measure them against.
    let peak = candidates.filter { !$0.reading.hasWindow }.map(\.tokens).max() ?? 0

    return candidates.map { c in
        let meta = providerMeta(c.provider)
        let reading = c.reading
        let windowed = reading.hasWindow
        let detail: String
        if windowed {
            detail = reading.reset
        } else {
            detail = c.tokens > 0 ? "\(formatTokenCount(c.tokens)) today" : "—"
        }
        let data = c.identity.data
        return UsageRow(
            id: c.identity.id,
            provider: c.provider,
            label: c.split ? c.identity.name : meta.short,
            subtitle: c.split ? c.identity.subtitle : nil,
            color: meta.color,
            fill: windowed ? usageTint : meta.color,
            fraction: reading.fraction ?? (peak > 0 ? Double(c.tokens) / Double(peak) : 0),
            pace: reading.pace,
            detail: detail,
            percentText: reading.percentText,
            windowLabel: windowed ? reading.main.label : "",
            windowShort: windowed ? reading.main.short : "",
            lane: windowed || c.tokens == 0 ? reading.other.map { laneFor($0.win) } : nil,
            laneText: reading.other.flatMap { other in
                reading.otherUsed.map { "\(other.label) \(Int($0.rounded()))% used" }
            } ?? "",
            tokens: c.tokens,
            sessions: c.sessions,
            data: data,
            stale: data.map { macNow - Double($0.updatedAt) > staleMs } ?? false
        )
    }
}

private func identitiesFor(_ provider: String, entries: [ProviderLimits],
                           accounts: [ClaudeAccountInfo]) -> [UsageIdentity] {
    if provider == "claude" { return claudeIdentities(entries, accounts: accounts) }
    let latest = entries.filter { $0.provider == provider }.max { $0.updatedAt < $1.updatedAt }
    return [UsageIdentity(id: provider, name: providerMeta(provider).short, data: latest)]
}

/// One identity per Claude account the person has: every account that reported,
/// plus the ones added on the Mac that have not run yet. Two accounts mean two
/// rows — they burn down separately.
private func claudeIdentities(_ entries: [ProviderLimits], accounts: [ClaudeAccountInfo]) -> [UsageIdentity] {
    let registered = accounts.filter { $0.id != claudeMainLogin }
    let known = Set(registered.map(\.id))
    var reported: [String: ProviderLimits] = [:]
    for entry in entries where entry.provider == "claude" {
        let id = entry.accountId.flatMap { $0.isEmpty ? nil : $0 } ?? claudeMainLogin
        // An account no longer on the Mac can never report again; its last
        // reading would linger as a row named by a raw id.
        guard id == claudeMainLogin || known.contains(id) else { continue }
        if let prev = reported[id], prev.updatedAt >= entry.updatedAt { continue }
        reported[id] = entry
    }
    if reported.isEmpty {
        return [UsageIdentity(id: "claude", name: providerMeta("claude").short)]
    }
    var ids = registered.map(\.id)
    if reported[claudeMainLogin] != nil { ids.append(claudeMainLogin) }
    return ids.map { id in
        let account = registered.first { $0.id == id }
        return UsageIdentity(
            id: "claude:\(id)",
            name: id == claudeMainLogin ? providerMeta("claude").short : account?.name ?? id,
            subtitle: account.flatMap { $0.email.isEmpty ? nil : $0.email },
            data: reported[id]
        )
    }
}

private func laneFor(_ win: LimitWindow?) -> UsageLane {
    guard let win else { return .empty }
    let used = max(0, min(100, win.usedPercent.isFinite ? win.usedPercent : 0))
    return UsageLane(fraction: used / 100, fill: usageTint)
}
