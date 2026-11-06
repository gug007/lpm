import SwiftUI

/// One way a new tab can start, a terminal or an agent, checked when picked.
struct NewTabStartRow: View {
    let label: String
    /// The agent's id; nil for the plain terminal.
    let agent: String?
    var emoji = ""
    let picked: Bool
    let onPick: () -> Void

    var body: some View {
        Button(action: onPick) {
            NewTabStartLabel(label: label, agent: agent, emoji: emoji, picked: picked)
        }
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}

/// A Start row's face: its mark, its name, and a check when picked.
struct NewTabStartLabel: View {
    let label: String
    let agent: String?
    var emoji = ""
    let picked: Bool

    var body: some View {
        HStack(spacing: 12) {
            LaunchpadMark(agent: agent, emoji: emoji)
                .frame(width: 28, height: 28)
                .accessibilityHidden(emoji.isEmpty || agentForEmoji(emoji) != nil)
            Text(label)
                .foregroundStyle(Color.primary)
            Spacer()
            if picked {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(.tint)
                    .accessibilityHidden(true)
            }
        }
        .contentShape(Rectangle())
    }
}
