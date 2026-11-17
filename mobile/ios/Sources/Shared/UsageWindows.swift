import Foundation

// The plan windows the usage rows, the Usage screen and the Usage widget read,
// with their pace math ported from the desktop's `components/stats/limitsFormat.ts`
// so all of them read the same numbers.
//
// Every `now` here is unix MILLIS on the phone's clock. `resetsAt` arrives as unix
// SECONDS from the tool's own servers and is converted inside these helpers, so
// callers pass the wire value untouched.

/// A reading older than this is shown dimmed: the tool has stopped reporting, so
/// the percentages describe the past rather than the present.
let staleMs = 15.0 * 60 * 1000

// The Mac slots a reading strictly by window length, so the lengths are fixed
// here and never travel on the wire.
let fiveHourMs = 5.0 * 60 * 60 * 1000
let weeklyMs = 7.0 * 24 * 60 * 60 * 1000

/// One plan window. `usedPercent` is whatever the tool reported and is NOT
/// clamped — readings above 100 occur — so clamp it for a bar and nothing else.
/// It reads as not-a-number when the Mac sent no usable figure, which the pace
/// math turns into an "unknown" verdict rather than a fabricated 0%.
/// `resetsAt` is 0 when the tool did not say when the window turns over.
struct LimitWindow {
    let usedPercent: Double
    let resetsAt: Int

    init(usedPercent: Double, resetsAt: Int) {
        self.usedPercent = usedPercent
        self.resetsAt = resetsAt
    }

    init(_ o: [String: Any]) {
        usedPercent = (o["usedPercent"] as? NSNumber)?.doubleValue ?? .nan
        resetsAt = (o["resetsAt"] as? NSNumber)?.intValue ?? 0
    }
}

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

/// When a window turns over, as a bare duration ("4d 10h", "now"); empty when
/// the tool did not say. The desktop sidebar's `resetDurationShort`.
func resetShort(_ resetsAt: Int, now: Double) -> String {
    guard resetsAt != 0 else { return "" }
    return durationShort(Double(resetsAt) * 1000 - now)
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

struct PickedWindow {
    let win: LimitWindow?
    let label: String
    let short: String
    let windowMs: Double
}

/// A tool's or account's use as of `now`, as a usage row reads it: the weekly
/// window — the one that actually runs out on people, and the desktop sidebar's
/// default — falling back to the 5-hour one, with the other one for the row's
/// lower lane. A window past its reset describes one that no longer exists and
/// is left out. A plan without a 5-hour window has the weekly one alone.
struct UsageReading {
    let main: PickedWindow
    let other: PickedWindow?
    let now: Double

    init(weekly: LimitWindow?, fiveHour: LimitWindow?, noFiveHour: Bool = false, now: Double) {
        let week = PickedWindow(win: liveWindow(weekly, now: now), label: "weekly", short: "", windowMs: weeklyMs)
        let five = PickedWindow(win: liveWindow(fiveHour, now: now), label: "5-hour", short: "5h",
                                windowMs: fiveHourMs)
        if noFiveHour {
            (main, other) = (week, nil)
        } else {
            (main, other) = week.win != nil ? (week, five) : (five, week)
        }
        self.now = now
    }

    var hasWindow: Bool { main.win != nil }

    /// The window's use as the tool reported it, 0 when it sent no figure; nil
    /// without a window.
    var used: Double? { main.win.map { $0.usedPercent.isFinite ? $0.usedPercent : 0 } }

    var otherUsed: Double? { other?.win.map { $0.usedPercent.isFinite ? $0.usedPercent : 0 } }

    /// How much of the bar is filled (0…1); nil without a window.
    var fraction: Double? { used.map { max(0, min(100, $0)) / 100 } }

    /// How far through its window the clock is (0…1), where the pace tick sits.
    var pace: Double? {
        computePace(main.win, windowMs: main.windowMs, now: now).map { $0.elapsedPercent / 100 }
    }

    /// When the window comes back, as a bare duration; empty without one.
    var reset: String { main.win.map { resetShort($0.resetsAt, now: now) } ?? "" }

    var percentText: String { used.map { "\(Int($0.rounded()))%" } ?? "" }
}

private func liveWindow(_ win: LimitWindow?, now: Double) -> LimitWindow? {
    guard let win else { return nil }
    return win.resetsAt > 0 && Double(win.resetsAt) * 1000 <= now ? nil : win
}
