import SwiftUI

/// What leads a launchpad option, as the desktop's LaunchpadMark draws it: its action's
/// emoji, so variants sharing a label stay apart, else the agent's mark. A terminal, or
/// an agent without a mark of its own, gets a symbol in the agent's colour.
struct LaunchpadMark: View {
    /// The agent's id; nil for the plain terminal.
    let agent: String?
    let emoji: String

    var body: some View {
        if let mark = AgentMark.ofEmoji(emoji) ?? (emoji.isEmpty ? agent.flatMap(AgentMark.init) : nil) {
            mark.frame(width: 20, height: 20)
        } else if emoji.isEmpty {
            Image(systemName: agent == nil ? "terminal" : "sparkle")
                .font(.system(size: 17))
                .foregroundStyle(agent.map { providerMeta($0).color } ?? .secondary)
        } else {
            Text(emoji).font(.system(size: 17))
        }
    }
}
