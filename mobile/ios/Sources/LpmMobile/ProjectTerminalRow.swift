import SwiftUI

/// One terminal inside a project's deck, read the way the project's own Tabs list
/// and the desktop sidebar read it: the tab's name carries the agent's state, and
/// the trailing edge holds the state's mark and how long it has been so. A seen
/// agent's row is gray.
struct ProjectTerminalRow: View {
    let row: ProjectAgentRow

    var body: some View {
        HStack(spacing: 6) {
            Text(row.title)
                .lineLimit(1)
                .agentTone(row.state, seen: row.seen)
            if row.shared > 0 {
                Text("+\(row.shared)")
                    .font(.caption2)
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            AgentStatusTrail(agent: row)
                .font(.footnote)
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .font(.subheadline)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    /// The agent is named when the tab was renamed away from it.
    private var accessibilityText: String {
        [row.title, row.state.label, row.seen ? "Seen" : nil,
         row.elapsed(now: Int(Date().timeIntervalSince1970 * 1000)), row.title == row.provider ? nil : row.provider]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}
