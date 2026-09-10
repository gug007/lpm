import SwiftUI

/// What a row shows before its name for the status a person gave it: the
/// state's emoji. A custom status that somehow lost its emoji falls back to
/// its name so the mark is never blank.
struct WorkStatusMark: View {
    let status: WorkStatus

    var body: some View {
        if status.displayEmoji.isEmpty {
            Text(status.displayLabel)
                .font(.caption2.weight(.medium))
                .foregroundStyle(.secondary)
        } else {
            Text(status.displayEmoji)
                .font(.system(size: 14))
                .accessibilityLabel(status.displayLabel)
        }
    }
}

/// The line under a row whose status carries a note: the status's word, then
/// the note. Only Blocked's word takes colour.
struct WorkStatusNoteLine: View {
    let status: WorkStatus
    let note: String

    var body: some View {
        HStack(spacing: 4) {
            Text(status.displayLabel)
                .foregroundStyle(status.state == .blocked ? AnyShapeStyle(Color.red) : AnyShapeStyle(.secondary))
            Text("·")
            Text(note)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}
