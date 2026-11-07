import SwiftUI

/// One terminal tab in the project's list, read the way the desktop sidebar reads
/// it: the name (with the tab's emoji) carries the agent's state, and the trailing
/// edge holds the state's mark and how long it has been so. Tapping opens the
/// terminal; the desktop's tab actions live on swipe gestures (Pin from the
/// leading edge; Rename / Close from the trailing edge) and the long-press menu.
struct TabRow: View {
    let term: TerminalInfo
    /// What the agent in this tab reports, nil for a plain shell.
    let agent: ProjectAgentRow?
    let onOpen: () -> Void

    @ScaledMetric(relativeTo: .body) private var markSide: CGFloat = 20

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 8) {
                EmojiLabel(emoji: term.emoji, label: term.label, markSide: markSide) {
                    Text($0)
                        .lineLimit(1)
                        .agentTone(agent?.state)
                }
                if let agent, !agent.shared.isEmpty {
                    Text("+\(agent.shared.count)")
                        .font(.caption)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                if term.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                Spacer(minLength: 8)
                if term.remote {
                    Text("Remote")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
                if let agent {
                    AgentStatusTrail(agent: agent)
                        .font(.subheadline)
                }
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityText)
    }

    private var accessibilityText: String {
        guard let agent else { return term.label }
        return [term.label, agent.state.label, agent.elapsed(now: Int(Date().timeIntervalSince1970 * 1000))]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

extension TerminalInfo {
    /// The tab's name as its row shows it, led by the tab's emoji.
    var title: String { emoji.isEmpty ? label : "\(emoji) \(label)" }
}
