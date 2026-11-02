import SwiftUI

/// A changed file as the review screen names it, the name carrying the weight,
/// with the lines it adds and removes.
struct ChangedFileRow: View {
    let file: AgentAnswerContent.File

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            name
                .lineLimit(1)
                .truncationMode(.head)
            Spacer(minLength: 8)
            HStack(spacing: 6) {
                if file.added > 0 { Text("+\(file.added)").foregroundStyle(.green) }
                if file.removed > 0 { Text("−\(file.removed)").foregroundStyle(.red) }
            }
            .font(.system(size: 12, weight: .semibold, design: .monospaced))
            .monospacedDigit()
        }
    }

    private var name: Text {
        let name = Text(file.name).font(.footnote.weight(.semibold))
        guard !file.directory.isEmpty else { return name }
        return name + Text("  " + file.directory).font(.caption).foregroundStyle(.secondary)
    }
}
