import SwiftUI
import UIKit

/// The recorder in place of a field or a composer's controls: the level trace and
/// the clock during a take, and what went wrong after a failed one.
struct DictationStrip: View {
    let store: DictationStore
    let owner: String
    let ink: Color
    let onRetry: () -> Void

    var body: some View {
        if let failure = store.failure(owner) {
            HStack(spacing: 8) {
                Text(failure.message)
                    .font(.system(size: 12))
                    .foregroundStyle(ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.9)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if failure.canRetry {
                    action("Record again", onRetry)
                } else if failure == .denied {
                    action("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                }
            }
        } else {
            HStack(spacing: 8) {
                DictationTrace(meter: store.meter, ink: ink, frozen: store.phase == .transcribing)
                    .accessibilityHidden(true)
                DictationClock(startedAt: store.startedAt, length: store.length,
                               running: store.phase == .recording)
                    .foregroundStyle(ink.opacity(0.6))
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(store.phase == .transcribing ? "Transcribing…" : "Recording")
        }
    }

    private func action(_ title: String, _ run: @escaping () -> Void) -> some View {
        Button(title, action: run)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(ink)
            .buttonStyle(.plain)
            .fixedSize()
    }
}

/// The field as it will read at Stop: the draft, then what the take has heard so far.
/// Past `maxHeight` the newest words are the ones that stay in sight.
struct DictationPreview: View {
    let text: String
    let maxHeight: CGFloat

    var body: some View {
        Text(text)
            .font(.body)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, maxHeight: maxHeight, alignment: .bottomLeading)
            .clipped()
    }
}

/// How long the take has run: counts while recording, then holds its length.
private struct DictationClock: View {
    let startedAt: Date?
    let length: TimeInterval
    let running: Bool

    var body: some View {
        Group {
            if running, let startedAt {
                TimelineView(.periodic(from: startedAt, by: 1)) { context in
                    label(context.date.timeIntervalSince(startedAt))
                }
            } else {
                label(length)
            }
        }
        .font(.system(size: 13).monospacedDigit())
    }

    private func label(_ elapsed: TimeInterval) -> Text {
        let seconds = max(0, Int(elapsed))
        return Text(verbatim: "\(seconds / 60):\(String(format: "%02d", seconds % 60))")
    }
}

/// The level trace, as if leaving a tape head at the right: silence is a dotted
/// line and speech rises into bars. It stops where the recording ended.
private struct DictationTrace: View {
    private static let step: CGFloat = 4.5
    private static let bar: CGFloat = 2.5
    private static let sampleInterval: TimeInterval = 0.07
    private static let maxSamples = 120

    let meter: DictationMeter
    let ink: Color
    let frozen: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var tape = Tape()

    var body: some View {
        TimelineView(.animation(minimumInterval: Self.sampleInterval, paused: frozen || reduceMotion)) { context in
            Canvas { canvas, size in
                tape.advance(to: context.date, level: meter.level, frozen: frozen)
                let mid = size.height / 2
                var x = size.width - Self.bar
                for sample in tape.samples.reversed() {
                    guard x > -Self.bar else { break }
                    let height = max(Self.bar, CGFloat(sample) * size.height)
                    let shape = CGRect(x: x, y: mid - height / 2, width: Self.bar, height: height)
                    canvas.fill(Path(roundedRect: shape, cornerRadius: Self.bar / 2), with: .color(ink.opacity(0.85)))
                    x -= Self.step
                }
            }
        }
        .frame(height: 22)
        .mask {
            LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.12)],
                           startPoint: .leading, endPoint: .trailing)
        }
    }

    private final class Tape {
        private(set) var samples: [Float] = []
        private var shown: Float = 0
        private var lastSample = Date.distantPast

        func advance(to now: Date, level: Float, frozen: Bool) {
            guard !frozen, now.timeIntervalSince(lastSample) >= sampleInterval else { return }
            lastSample = now
            // Quick to rise, slower to fall, like a VU meter.
            shown += (level - shown) * (level > shown ? 0.55 : 0.18)
            samples.append(shown)
            if samples.count > maxSamples { samples.removeFirst(samples.count - maxSamples) }
        }
    }
}

/// The filled round button that stands in for Send while there's nothing to send.
struct DictationDisc<Glyph: View>: View {
    let ground: Color
    let label: String
    let action: () -> Void
    @ViewBuilder let glyph: Glyph

    var body: some View {
        Button(action: action) {
            glyph
                .frame(width: 32, height: 32)
                .background(ground)
                .clipShape(Circle())
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// The plain mic beside Send, for adding to what's in the field.
struct DictationGhostMic: View {
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "mic")
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(color)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Dictate")
    }
}

/// Ends a take in the seat the mic was in, or spins while its words arrive.
struct DictationStopButton: View {
    let store: DictationStore
    let glyph: Color

    private var transcribing: Bool { store.phase == .transcribing }

    var body: some View {
        DictationDisc(ground: .red, label: transcribing ? "Transcribing…" : "Stop and insert",
                      action: { store.stop() }) {
            if transcribing {
                ProgressView().controlSize(.small).tint(glyph)
            } else {
                Image(systemName: "stop.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(glyph)
            }
        }
        .disabled(transcribing)
    }
}

/// In the "+" seat during a take, or to dismiss a failed one's notice.
struct DictationCancelButton: View {
    let color: Color
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .medium))
                .foregroundStyle(color)
                .frame(width: 36, height: 36)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
