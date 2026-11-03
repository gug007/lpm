import Foundation
import SwiftUI

/// Formatting for the Usage screen, ported from the desktop's
/// `components/stats/limitsFormat.ts` so both read the same numbers; the pace
/// math itself lives in `Shared/UsageWindows.swift`, which the widgets share.
///
/// Every `now` here is unix MILLIS. `resetsAt` arrives as unix SECONDS and is
/// converted inside these helpers, so callers pass the wire value untouched.

/// The verdict in words; empty when there is nothing worth judging yet.
func paceLabel(_ pace: Pace?) -> String {
    switch pace?.verdict {
    case .over: return "too fast"
    case .under: return "will last"
    case .on: return "on pace"
    case .exhausted: return "limit reached"
    default: return ""
    }
}

/// lpm's own accent, the desktop's `--accent-cyan` in each appearance. lpm
/// commands read in it.
let accentCyan = Color(light: "#06B6D4", dark: "#22D3EE")

/// The one tint usage bars are drawn in, however full they get — the desktop's
/// `USAGE_FILL`.
let usageTint = accentCyan

/// The use past a bar's pace tick — the desktop's `--accent-red`.
let usageAheadTint = Color(light: "#EF4444", dark: "#F87171")

extension Color {
    init(light: String, dark: String) {
        let light = UIColor(Color(hex: light))
        let dark = UIColor(Color(hex: dark))
        self.init(UIColor { $0.userInterfaceStyle == .dark ? dark : light })
    }
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

/// How long ago the tool last reported. `updatedAt` is unix MILLIS.
func updatedText(_ updatedAt: Int, now: Double) -> String {
    let mins = Int(((now - Double(updatedAt)) / 60_000).rounded())
    if mins < 1 { return "updated just now" }
    if mins < 60 { return "updated \(mins)m ago" }
    let hours = Int((Double(mins) / 60).rounded())
    if hours < 24 { return "updated \(hours)h ago" }
    return "updated \(Int((Double(hours) / 24).rounded()))d ago"
}
