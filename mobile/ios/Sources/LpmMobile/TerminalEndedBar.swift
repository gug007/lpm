import SwiftUI

/// In place of the composer once a terminal's process has ended: nothing typed
/// here could reach it, so this says so and offers the two ways on, as the
/// desktop's bar does. Restart shows only where the Mac can run it again.
struct TerminalEndedBar: View {
    let label: String
    let ending: TerminalEnding
    let background: Color
    var onRestart: (() -> Void)?
    let onClose: () -> Void

    private var how: String {
        ending.gone ? "has ended" : "exited with code \(ending.code)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(label) \(how) — it no longer takes input.")
                .font(.footnote)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(2)
            HStack(spacing: 10) {
                if let onRestart {
                    Button(action: onRestart) {
                        Label {
                            Text("Restart")
                        } icon: {
                            if ending.restarting {
                                ProgressView().controlSize(.small)
                            } else {
                                Image(systemName: "arrow.clockwise")
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(ending.restarting)
                }
                Button(action: onClose) {
                    Label("Close tab", systemImage: "xmark")
                }
                .buttonStyle(.borderless)
                .foregroundStyle(.white.opacity(0.7))
                Spacer(minLength: 0)
            }
            .font(.subheadline)
            .tint(.white)
        }
        .terminalBottomBar(background)
    }
}
