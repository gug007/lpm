import SwiftUI

/// The floating transport for read-aloud: play/pause, elapsed time, progress, and
/// sentence skips. There is no time scrubber — a speech synthesizer has no
/// timeline to seek within — so the skips move between sentences instead.
struct SpeechBar: View {
    let store: SpeechStore

    var body: some View {
        HStack(spacing: 8) {
            Button(action: store.togglePause) {
                Image(systemName: store.mode == .paused ? "play.fill" : "pause.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(width: 30, height: 30)
                    .background(Color.primary.opacity(0.08), in: Circle())
            }

            Text(timeText)
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

            ProgressView(value: store.progress)
                .progressViewStyle(.linear)
                .frame(minWidth: 40)

            SkipButton(systemImage: "backward.fill") { store.skip(-1) }
            SkipButton(systemImage: "forward.fill") { store.skip(1) }

            Menu {
                ForEach(SpeechPrefs.rates, id: \.self) { rate in
                    Button {
                        store.setRate(rate)
                    } label: {
                        if rate == SpeechPrefs.rate {
                            Label(SpeechPrefs.rateLabel(rate), systemImage: "checkmark")
                        } else {
                            Text(SpeechPrefs.rateLabel(rate))
                        }
                    }
                }
            } label: {
                Text(SpeechPrefs.rateLabel(SpeechPrefs.rate))
                    .font(.caption.weight(.semibold))
                    .frame(width: 32, height: 26)
            }

            Button(action: store.stop) {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .frame(width: 26, height: 26)
            }
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08)))
        .shadow(color: .black.opacity(0.15), radius: 12, y: 4)
    }

    private var timeText: String {
        let total = Int(store.elapsed)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}

private struct SkipButton: View {
    let systemImage: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 11))
                .frame(width: 26, height: 26)
                .foregroundStyle(.secondary)
        }
    }
}
