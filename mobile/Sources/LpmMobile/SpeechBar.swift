import SwiftUI

/// The floating transport for read-aloud: a timeline over a centred transport,
/// laid out like the player people already know from every podcast app.
///
/// Two engines share this bar and differ in the one way that matters: a rendered
/// clip has a real timeline, so it can be scrubbed and skipped by seconds, while
/// the on-device synthesizer has no position to seek to — its track shows how far
/// through the text the voice is and the skips move by sentence. The layout is
/// identical either way, so nothing moves under the thumb when the engine changes.
struct SpeechBar: View {
    let store: SpeechStore

    var body: some View {
        VStack(spacing: 8) {
            timeline
            transport
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.regularMaterial, in: shape)
        .overlay(shape.strokeBorder(Color.primary.opacity(0.08)))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 24, style: .continuous) }

    // MARK: timeline

    /// While the Mac renders, there is no position to show and no time to count —
    /// so the row says what is happening instead of animating a dead track.
    @ViewBuilder private var timeline: some View {
        if store.isLoading {
            HStack(spacing: 8) {
                Text("Preparing audio…")
                Spacer(minLength: 0)
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
            .frame(height: 22)
        } else {
            HStack(spacing: 10) {
                Text(clock(store.elapsed))
                    .frame(width: 34, alignment: .leading)
                SpeechScrubber(progress: store.progress, seekable: store.canSeek) { ratio in
                    store.seek(to: ratio * store.duration)
                }
                Text(trailingText)
                    .frame(width: 40, alignment: .trailing)
            }
            .font(.caption2.monospacedDigit())
            .foregroundStyle(.secondary)
            .frame(height: 22)
        }
    }

    /// Time left when there is a clip to measure it against; otherwise how far
    /// through the text the voice is, which is the only honest number the
    /// synthesizer can give.
    private var trailingText: String {
        store.duration > 0
            ? "-" + clock(max(0, store.duration - store.elapsed))
            : "\(Int((store.progress * 100).rounded()))%"
    }

    private func clock(_ seconds: TimeInterval) -> String {
        let total = Int(seconds.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    // MARK: transport

    /// Speed and stop sit on the edges in equal-width slots so the three controls
    /// you actually reach for stay centred under the thumb.
    private var transport: some View {
        HStack(spacing: 0) {
            rateMenu.frame(width: 56, alignment: .leading)
            Spacer(minLength: 4)
            HStack(spacing: 16) {
                TransportButton(systemImage: store.canSeek ? "gobackward.15" : "backward.fill",
                                size: 20,
                                label: store.canSeek ? "Back 15 seconds" : "Previous sentence",
                                tint: .primary) { store.skip(-1) }
                    .disabled(store.isLoading)
                playPause
                TransportButton(systemImage: store.canSeek ? "goforward.15" : "forward.fill",
                                size: 20,
                                label: store.canSeek ? "Forward 15 seconds" : "Next sentence",
                                tint: .primary) { store.skip(1) }
                    .disabled(store.isLoading)
            }
            Spacer(minLength: 4)
            TransportButton(systemImage: "xmark", size: 15, label: "Stop reading", tint: .secondary) {
                store.stop()
            }
            .frame(width: 56, alignment: .trailing)
        }
    }

    private var playPause: some View {
        Button {
            Haptics.tap()
            store.togglePause()
        } label: {
            ZStack {
                Circle().fill(Color.accentColor)
                if store.isLoading {
                    ProgressView().controlSize(.small).tint(.white)
                } else {
                    Image(systemName: store.mode == .paused ? "play.fill" : "pause.fill")
                        .font(.system(size: 17, weight: .bold))
                        .foregroundStyle(.white)
                        .contentTransition(.symbolEffect(.replace))
                }
            }
            .frame(width: 46, height: 46)
        }
        .buttonStyle(.plain)
        .disabled(store.isLoading)
        .accessibilityLabel(store.mode == .paused ? "Play" : "Pause")
    }

    private var rateMenu: some View {
        Menu {
            Picker("Speed", selection: rateBinding) {
                ForEach(SpeechPrefs.rates, id: \.self) { rate in
                    Text(SpeechPrefs.rateLabel(rate)).tag(rate)
                }
            }
        } label: {
            Text(SpeechPrefs.rateLabel(store.rate))
                .font(.footnote.weight(.semibold).monospacedDigit())
                .foregroundStyle(.primary)
                .frame(width: 44, height: 30)
                .background(Color.primary.opacity(0.07), in: Capsule())
        }
        .accessibilityLabel("Speed")
        .accessibilityValue(SpeechPrefs.rateLabel(store.rate))
    }

    private var rateBinding: Binding<Double> {
        Binding(get: { store.rate }, set: { store.setRate($0) })
    }
}

/// The timeline. A rendered clip can be scrubbed, so it carries a knob and a track
/// that thickens under the finger; the synthesizer's version is the same shape
/// without them, because there is nothing to grab.
private struct SpeechScrubber: View {
    let progress: Double
    let seekable: Bool
    let onSeek: (Double) -> Void

    @State private var dragRatio: Double?

    private let knob: CGFloat = 12

    var body: some View {
        GeometryReader { geo in
            let width = max(1, geo.size.width)
            let ratio = min(max(dragRatio ?? progress, 0), 1)
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.12))
                Capsule().fill(Color.accentColor).frame(width: width * ratio)
            }
            .frame(height: dragRatio == nil ? 5 : 8)
            .frame(maxHeight: .infinity)
            .overlay(alignment: .leading) {
                if seekable {
                    Circle()
                        .fill(.white)
                        .shadow(color: .black.opacity(0.25), radius: 2, y: 1)
                        .frame(width: knob, height: knob)
                        .offset(x: min(max(0, width * ratio - knob / 2), width - knob))
                }
            }
            .contentShape(Rectangle())
            .gesture(seekable ? scrub(width: width) : nil)
            .animation(.easeOut(duration: 0.15), value: dragRatio == nil)
        }
        .frame(height: 22)
        .accessibilityElement()
        .accessibilityLabel("Playback position")
        .accessibilityValue("\(Int((progress * 100).rounded()))%")
    }

    /// Tracks the finger live rather than jumping on release, so a scrub can be
    /// aimed. `minimumDistance: 0` makes a plain tap a seek too.
    private func scrub(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                if dragRatio == nil { Haptics.tap() }
                dragRatio = ratio(value.location.x, width)
            }
            .onEnded { value in
                onSeek(ratio(value.location.x, width))
                dragRatio = nil
            }
    }

    private func ratio(_ x: CGFloat, _ width: CGFloat) -> Double {
        min(max(0, Double(x / width)), 1)
    }
}

private struct TransportButton: View {
    let systemImage: String
    let size: CGFloat
    let label: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            Image(systemName: systemImage)
                .font(.system(size: size, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
