import SwiftUI

/// The answer the next prompt asks for, shown over the field while it's on, so
/// it's always in sight and one tap from undone. Kept in step with the
/// desktop's `ComposerAnswerChip`.
struct ComposerAnswerChip: View {
    let kind: AnswerKind
    let accent: Color
    let onOff: () -> Void

    var body: some View {
        Button(action: onOff) {
            HStack(spacing: 5) {
                Image(systemName: kind.symbol)
                Text(kind.chip)
                Image(systemName: "xmark").font(.caption2.weight(.bold))
            }
            .font(.footnote.weight(.medium))
            .foregroundStyle(accent)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(accent.opacity(0.18), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(kind.chip), \(AnswerKind.backToText)")
    }
}
