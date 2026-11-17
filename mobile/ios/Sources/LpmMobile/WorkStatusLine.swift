import SwiftUI

/// The line under a row's name for the status a person gave it: the state's
/// emoji, its word, then the note when there is one. Only Blocked's word
/// takes colour.
struct WorkStatusLine: View {
    let status: WorkStatus

    var body: some View {
        HStack(spacing: 4) {
            if !status.displayEmoji.isEmpty {
                Text(status.displayEmoji)
                    .fixedSize()
                    .accessibilityHidden(true)
            }
            Text(status.displayLabel)
                .foregroundStyle(status.state == .blocked ? AnyShapeStyle(Color.red) : AnyShapeStyle(.secondary))
            if let note = status.note {
                Text("·")
                Text(note)
            }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}
