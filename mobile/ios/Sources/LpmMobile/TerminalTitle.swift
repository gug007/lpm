import SwiftUI

/// A terminal screen's title: the tab's name, how long its agent has been at it
/// above, and the project's uncommitted changes below. The connection's status
/// takes the top line whenever the Mac isn't connected.
struct TerminalTitle: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    /// The bar's middle, in global coordinates.
    let axis: CGFloat?

    private var offline: Bool { !model.demoMode && !model.link.isReady }

    private var agent: ProjectAgentRow? {
        guard let project = model.projects.first(where: { $0.name == term.project }) else { return nil }
        let rows = projectAgentRows(project, now: Int(Date().timeIntervalSince1970 * 1000), tabTitles: [:])
        guard let agent = agentRowsByTerminal(rows)[term.id], agent.state != .idle else { return nil }
        return agent
    }

    var body: some View {
        BarTitle(name: term.label, project: term.project, stale: offline, axis: axis) {
            if offline {
                BarConnectionLine(line: model.link.statusLine)
            } else if let agent, let since = agent.since {
                TerminalAgentLine(state: agent.state, since: since, until: agent.until, pause: agent.pause)
            }
        }
    }
}

/// How long the agent has been at it, with its state named when that isn't plain
/// work, in the state's color when it wants a look.
private struct TerminalAgentLine: View {
    let state: AgentState
    let since: Int
    let until: Int?
    let pause: AgentPause?

    private var word: String? { state == .working ? nil : state.label }
    private var textColor: Color { state == .needsYou || state == .error ? state.tint : .secondary }

    var body: some View {
        HStack(spacing: 3) {
            if let pause {
                Text("\(AgentPause.label) · \(pause.shellsLabel)")
            } else {
                if let word { Text("\(word) ·") }
                ElapsedText(since: since, until: until, precise: true)
            }
        }
        .font(BarTitleLine.font)
        .foregroundStyle(textColor)
        .lineLimit(1)
    }
}
