import SwiftUI

/// Above Commit while a commit is being written: its message and what's left
/// out, so coming back to Changes shows the draft was kept, with × to start over.
struct CommitDraftChip: View {
    let draft: CommitDraft
    let files: [GitFile]
    let onClear: () -> Void

    private var summary: String {
        var parts: [String] = []
        let firstLine = draft.message.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
        if !firstLine.trimmingCharacters(in: .whitespaces).isEmpty { parts.append("“\(firstLine)”") }
        let left = files.filter { draft.deselected.contains($0.path) }
        if left.count == 1 { parts.append("\(left[0].name) left out") }
        else if left.count > 1 { parts.append("\(left.count) files left out") }
        return "Draft: " + parts.joined(separator: " · ")
    }

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "pencil")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text(summary)
                .font(.footnote)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button(action: onClear) {
                Image(systemName: "xmark")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(width: 44, height: 36)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Clear draft")
        }
        .padding(.leading, 12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .frame(maxWidth: .infinity)
        .background(.bar)
    }
}
