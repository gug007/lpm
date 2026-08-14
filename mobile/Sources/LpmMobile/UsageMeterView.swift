import SwiftUI

/// One plan-usage window meter — the port of the desktop `UsageMeter`.
///
/// A bare "62% used" means nothing on its own, so the percentage is judged
/// against how much of the window has already burned down: the verdict sits
/// beside the number and the tick on the bar marks elapsed time.
struct UsageMeterView: View {
    let label: String
    let win: LimitWindow?
    let windowMs: Double
    let now: Double
    var stale: Bool = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let meter = state

        VStack(alignment: .leading, spacing: 8) {
            Text(label.uppercased())
                .font(.caption2.weight(.semibold))
                .kerning(0.6)
                .foregroundStyle(.secondary)

            valueRow(meter)

            bar(meter)

            VStack(alignment: .leading, spacing: 2) {
                if !meter.resetLine.isEmpty {
                    Text(meter.resetLine)
                        .foregroundStyle(.secondary)
                }
                if !meter.runsOut.isEmpty {
                    Text(meter.runsOut)
                        .foregroundStyle(.orange)
                }
            }
            .font(.caption)
            .monospacedDigit()
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label) window usage")
        .accessibilityValue(meter.accessibilityValue)
    }

    /// The verdict sits beside the number while it fits and drops below it once
    /// large text leaves no room, matching the desktop's wrapping row.
    private func valueRow(_ meter: MeterState) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                percent(meter)
                verdict(meter, wraps: false)
                Spacer(minLength: 0)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    percent(meter)
                    Spacer(minLength: 0)
                }
                verdict(meter, wraps: true)
            }
        }
    }

    private func percent(_ meter: MeterState) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(meter.hasData ? "\(meter.shown)" : "—")
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(meter.hasData && !stale ? Color.primary : Color.secondary)
            if meter.hasData {
                Text("%")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func verdict(_ meter: MeterState, wraps: Bool) -> some View {
        if !meter.verdict.isEmpty {
            Text(meter.verdict)
                .font(.caption)
                .foregroundStyle(meter.verdictColor)
                .lineLimit(wraps ? nil : 1)
                .minimumScaleFactor(wraps ? 1 : 0.75)
                .fixedSize(horizontal: false, vertical: wraps)
        }
    }

    private func bar(_ meter: MeterState) -> some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(.tertiarySystemFill))
                Capsule()
                    .fill(meter.barColor)
                    .frame(width: meter.barFraction * geo.size.width)
                    .opacity(stale ? 0.4 : 1)
                if meter.showTick {
                    Rectangle()
                        .fill(Color(.secondaryLabel).opacity(0.7))
                        .frame(width: 1.5)
                        .offset(x: tickOffset(meter.elapsedFraction, width: geo.size.width))
                }
            }
            .animation(reduceMotion ? nil : .easeOut(duration: 0.7), value: meter.barFraction)
        }
        .frame(height: 6)
    }

    private func tickOffset(_ fraction: Double, width: CGFloat) -> CGFloat {
        max(0, min(width - 1.5, fraction * width - 0.75))
    }

    private var state: MeterState {
        let pace = computePace(win, windowMs: windowMs, now: now)
        let expired = pace?.expired ?? false
        // Past its reset the last reading describes a window that no longer
        // exists, so it reads as absent rather than as a number to act on.
        let hasData = win != nil && !expired

        let used = win?.usedPercent ?? 0
        let raw = used.isFinite ? used : 0
        let clamped = max(0, min(100, raw))
        let shown = Int(max(0, raw).rounded())
        let resetsAt = win?.resetsAt ?? 0

        var showTick = false
        var elapsedFraction = 0.0
        var elapsedPercent = 0
        var runsOut = ""
        if let pace {
            elapsedFraction = max(0, min(1, pace.elapsedPercent / 100))
            elapsedPercent = Int(pace.elapsedPercent.rounded())
            showTick = hasData && pace.verdict != .early && pace.verdict != .unknown
            if hasData, pace.verdict == .over, let exhaustsInMs = pace.exhaustsInMs {
                runsOut = "runs out in ~\(durationShort(exhaustsInMs)), before reset"
            }
        }

        let verdict = expired ? "window reset · awaiting new data" : paceLabel(pace)
        let resetSoon = resetsAt > 0 ? resetText(resetsAt, now: now) : ""
        let resetLine = hasData && resetsAt > 0
            ? "\(resetSoon) · \(resetAbsolute(resetsAt))"
            : ""

        var spoken = "no data yet"
        if hasData {
            spoken = [
                "\(shown)% used",
                verdict,
                showTick ? "\(elapsedPercent)% of the window elapsed" : "",
                resetSoon,
                runsOut,
            ]
            .filter { !$0.isEmpty }
            .joined(separator: ", ")
        } else if expired {
            spoken = "window reset, awaiting new data"
        }

        return MeterState(
            hasData: hasData,
            shown: shown,
            verdict: verdict,
            verdictColor: verdictColor(pace?.verdict, expired: expired),
            barFraction: hasData ? clamped / 100 : 0,
            barColor: barTint(clamped),
            elapsedFraction: elapsedFraction,
            showTick: showTick,
            resetLine: resetLine,
            runsOut: runsOut,
            accessibilityValue: spoken
        )
    }

    private func verdictColor(_ verdict: PaceVerdict?, expired: Bool) -> Color {
        guard !expired, let verdict else { return .secondary }
        switch verdict {
        case .exhausted: return .red
        case .over: return .orange
        default: return .secondary
        }
    }
}

private struct MeterState {
    let hasData: Bool
    let shown: Int
    let verdict: String
    let verdictColor: Color
    let barFraction: Double
    let barColor: Color
    let elapsedFraction: Double
    let showTick: Bool
    let resetLine: String
    let runsOut: String
    let accessibilityValue: String
}
