import SwiftUI

/// "45s", "4m", "2h 5m" since `since`, or held at `until` once the work ended.
/// A running reading redraws only itself, and only when the text changes: each
/// second for the first minute, then on each minute — so a list of running agents
/// isn't rebuilt every second to move a label that reads "4m" for sixty of them.
struct ElapsedText: View {
    /// Unix millis.
    let since: Int
    let until: Int?
    /// Keeps the seconds for the first hour — "4m 30s" rather than "4m" — for a
    /// lone reading with room for a stopwatch.
    var precise = false

    var body: some View {
        if let until {
            label(until)
        } else {
            TimelineView(ElapsedSchedule(since: since, secondsFor: precise ? 3_600_000 : 60_000)) { context in
                label(Int(context.date.timeIntervalSince1970 * 1000))
            }
        }
    }

    private func label(_ now: Int) -> some View {
        let millis = now - since
        return Text(precise ? formatDuration(max(0, millis) / 1000) : shortDuration(millis: millis))
            .monospacedDigit()
    }
}

/// The instants an elapsed reading changes: second steps while the reading shows
/// seconds (`secondsFor` millis), minute steps after.
private struct ElapsedSchedule: TimelineSchedule {
    let since: Int
    let secondsFor: Int

    func entries(from startDate: Date, mode: TimelineScheduleMode) -> Entries {
        Entries(upcoming: startDate, since: since, secondsFor: secondsFor)
    }

    struct Entries: Sequence, IteratorProtocol {
        var upcoming: Date
        let since: Int
        let secondsFor: Int

        mutating func next() -> Date? {
            let current = upcoming
            let elapsed = Int(current.timeIntervalSince1970 * 1000) - since
            let step = elapsed < secondsFor ? 1_000 : 60_000
            let wait = step - ((elapsed % step) + step) % step
            upcoming = current.addingTimeInterval(Double(wait) / 1000)
            return current
        }
    }
}
