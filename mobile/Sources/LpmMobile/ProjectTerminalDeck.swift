import SwiftUI

/// Every terminal a project has going, as one recessed card nested under the
/// project's own row and inset to start beneath its name — so a terminal reads as
/// part of the project above it rather than as another project beside it.
struct ProjectTerminalDeck: View {
    let rows: [ProjectAgentRow]
    /// Unix millis, ticked by the list so a running reading stays live.
    let now: Int
    let open: (ProjectAgentRow) -> Void

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 {
                    Divider().padding(.leading, 10)
                }
                Button { open(row) } label: {
                    ProjectTerminalRow(row: row, now: now)
                }
                .buttonStyle(.plain)
                .disabled(row.terminalId == nil)
            }
        }
        // One step off the row behind it in both appearances — the grouped-secondary
        // tone a list row already uses is identical to it in dark, which would leave
        // the hairline doing all the work.
        .background(Color(.tertiarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
        }
    }
}
