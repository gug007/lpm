import Foundation
import SwiftUI

/// Pure pace math and formatting for the Usage screen, ported from the desktop's
/// `components/stats/limitsFormat.ts` so both read the same numbers.
///
/// Every `now` here is unix MILLIS. `resetsAt` arrives as unix SECONDS and is
/// converted inside these helpers, so callers pass the wire value untouched.

/// A reading older than this is shown dimmed: the tool has stopped reporting, so
/// the percentages describe the past rather than the present.
let staleMs = 15.0 * 60 * 1000

// The Mac slots a reading strictly by window length, so the lengths are fixed
// here and never travel on the wire.
let fiveHourMs = 5.0 * 60 * 60 * 1000
let weeklyMs = 7.0 * 24 * 60 * 60 * 1000

enum PaceVerdict {
    case unknown, early, under, on, over, exhausted
}

struct Pace {
    let expired: Bool
    let elapsedPercent: Double
    let ratio: Double
    let verdict: PaceVerdict
    let exhaustsInMs: Double?
}

private let overRatio = 1.15
private let underRatio = 0.85
private let minElapsedPercent = 5.0

/// A raw "60% used" says nothing without knowing how much of the window has
/// burned down, so every percentage is judged against elapsed wall-clock time.
func computePace(_ win: LimitWindow?, windowMs: Double, now: Double) -> Pace? {
    guard let win, win.resetsAt != 0, windowMs > 0 else { return nil }

    let resetsAtMs = Double(win.resetsAt) * 1000
    let expired = resetsAtMs <= now
    let elapsedMs = max(0, min(windowMs, windowMs - (resetsAtMs - now)))
    let elapsedPercent = elapsedMs / windowMs * 100

    let usedPercent = win.usedPercent
    guard usedPercent.isFinite else {
        return Pace(expired: expired, elapsedPercent: elapsedPercent, ratio: 0,
                    verdict: .unknown, exhaustsInMs: nil)
    }

    let ratio = elapsedPercent > 0 ? usedPercent / elapsedPercent : 0

    let verdict: PaceVerdict
    if usedPercent >= 100 {
        verdict = .exhausted
    } else if elapsedPercent < minElapsedPercent {
        verdict = .early
    } else if ratio > overRatio {
        verdict = .over
    } else if ratio < underRatio {
        verdict = .under
    } else {
        verdict = .on
    }

    // Only worth saying when the burn actually lands before the window turns
    // over — otherwise the window resets first and nothing runs out.
    var exhaustsInMs: Double?
    let rate = elapsedMs > 0 ? usedPercent / elapsedMs : 0
    if rate > 0, usedPercent < 100 {
        let msToFull = (100 - usedPercent) / rate
        if msToFull.isFinite, now + msToFull < resetsAtMs { exhaustsInMs = msToFull }
    }

    return Pace(expired: expired, elapsedPercent: elapsedPercent, ratio: ratio,
                verdict: verdict, exhaustsInMs: exhaustsInMs)
}

/// The verdict in words; empty when there is nothing worth judging yet.
func paceLabel(_ pace: Pace?) -> String {
    switch pace?.verdict {
    case .over: return "ahead of pace"
    case .under: return "under pace"
    case .on: return "on pace"
    case .exhausted: return "limit reached"
    default: return ""
    }
}

/// Bar color for a percentage already clamped to 0…100.
func barTint(_ pct: Double) -> Color {
    if pct >= 95 { return .red }
    if pct >= 80 { return .orange }
    return .accentColor
}

/// "resets in 2h 30m" / "resets now"; empty when the turnover time is unknown.
func resetText(_ resetsAt: Int, now: Double) -> String {
    guard resetsAt != 0 else { return "" }
    let delta = Double(resetsAt) * 1000 - now
    return delta <= 0 ? "resets now" : "resets in \(durationShort(delta))"
}

/// The turnover time as a date, in the phone's locale and time zone.
func resetAbsolute(_ resetsAt: Int) -> String {
    guard resetsAt != 0 else { return "" }
    return Date(timeIntervalSince1970: Double(resetsAt))
        .formatted(.dateTime.month(.abbreviated).day().hour().minute())
}

/// A span in coarse buckets: "1m", "2h 10m", "2d 2h". Anything under a minute
/// still reads as a minute, so a live countdown never shows "0m".
func durationShort(_ ms: Double) -> String {
    guard ms.isFinite, ms > 0 else { return "now" }
    let mins = Int((ms / 60_000).rounded())
    if mins < 60 { return "\(max(1, mins))m" }
    let hours = mins / 60
    let remMins = mins % 60
    if hours < 24 { return remMins != 0 ? "\(hours)h \(remMins)m" : "\(hours)h" }
    let days = hours / 24
    let remHours = hours % 24
    return remHours != 0 ? "\(days)d \(remHours)h" : "\(days)d"
}

/// How long ago the tool last reported. `updatedAt` is unix MILLIS.
func updatedText(_ updatedAt: Int, now: Double) -> String {
    let mins = Int(((now - Double(updatedAt)) / 60_000).rounded())
    if mins < 1 { return "updated just now" }
    if mins < 60 { return "updated \(mins)m ago" }
    let hours = Int((Double(mins) / 60).rounded())
    if hours < 24 { return "updated \(hours)h ago" }
    return "updated \(Int((Double(hours) / 24).rounded()))d ago"
}
