import SwiftUI

/// Inside an empty composer: the last prompt sent in this tab, one tap from being
/// typed again. It sits in the field rather than on a row of its own, so the
/// terminal above never loses or regains rows (and the Mac's never resizes) as
/// the field empties and fills.
struct ComposerRecallButton: View {
    static let maxWidth: CGFloat = 120

    let prompt: String
    let onRecall: () -> Void
    let onHistory: () -> Void

    private var summary: String {
        prompt.split(whereSeparator: \.isNewline).first.map(String.init) ?? prompt
    }

    var body: some View {
        Button(action: onRecall) {
            HStack(spacing: 4) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.caption.weight(.semibold))
                Text(summary)
                    .font(.footnote)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .foregroundStyle(Color.orange)
            .padding(.horizontal, 10)
            .frame(maxWidth: Self.maxWidth, minHeight: 30)
            .background(Color.white.opacity(0.1), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button(action: onRecall) { Label("Use Last Prompt", systemImage: "arrow.counterclockwise") }
            Button(action: onHistory) { Label("History", systemImage: "clock") }
        }
        .accessibilityLabel("Last prompt")
        .accessibilityValue(prompt)
        .accessibilityHint("Puts it back in the message field")
    }
}
