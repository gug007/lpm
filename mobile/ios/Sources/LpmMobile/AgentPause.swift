import SwiftUI

/// A turn that stopped beside background shells: the agent sits idle until one of
/// them ends and wakes it, though its status still says running. Mirrors the
/// desktop's agentPause.ts.
struct AgentPause: Equatable {
    /// Millis: when the turn stopped.
    var since: Int
    /// What each shell is doing, in the agent's words.
    var shells: [String]

    static let label = "Paused"
    /// The desktop's violet: working's color, held still.
    static let tint = Color(light: "#6D28D9", dark: "#A78BFA")

    /// "1 shell", "2 shells" — the words Claude's own screen uses.
    var shellsLabel: String { shells.count == 1 ? "1 shell" : "\(shells.count) shells" }
}

extension StatusEntry {
    var pause: AgentPause? {
        guard value == "Running", pausedAt > 0, !shells.isEmpty else { return nil }
        return AgentPause(since: pausedAt, shells: shells)
    }
}

extension ProjectAgentRow {
    /// The state's word, which a paused turn replaces.
    var stateLabel: String { pause == nil ? state.label : AgentPause.label }
}

extension View {
    /// `agentTone` for a row: held still in violet while its turn is paused.
    @ViewBuilder
    func agentTone(_ agent: ProjectAgentRow?) -> some View {
        if let agent, agent.pause != nil, !agent.seen {
            foregroundStyle(AgentPause.tint)
        } else {
            agentTone(agent?.state, seen: agent?.seen ?? false)
        }
    }
}

/// "1 shell" — what a paused agent waits on, where a mark and a clock would
/// otherwise end its row.
struct AgentShellChip: View {
    let pause: AgentPause

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "pause.fill")
                .imageScale(.small)
            Text(pause.shellsLabel)
        }
        .font(.caption.weight(.medium))
        .foregroundStyle(AgentPause.tint)
        .lineLimit(1)
        .padding(.horizontal, 7)
        .padding(.vertical, 2)
        .background(AgentPause.tint.opacity(0.16), in: RoundedRectangle(cornerRadius: 6))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(pause.shellsLabel)
    }
}
