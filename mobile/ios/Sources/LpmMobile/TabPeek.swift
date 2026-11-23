import SwiftUI

extension View {
    /// A tab's long-press menu. When an agent reports in the tab, the menu opens
    /// over the desktop's tab card instead of a snapshot of the row.
    @ViewBuilder
    func tabMenu<Items: View>(term: TerminalInfo, agent: ProjectAgentRow?,
                              @ViewBuilder items: () -> Items) -> some View {
        if let agent {
            contextMenu { items() } preview: { TabPeekCard(term: term, agent: agent) }
        } else {
            contextMenu { items() }
        }
    }
}

/// The desktop's tab hover card: the tab's full name over the agent's state, how
/// long it has been in it with the clock time it started or ended, and the agent.
struct TabPeekCard: View {
    let term: TerminalInfo
    let agent: ProjectAgentRow

    @ScaledMetric(relativeTo: .headline) private var markSide: CGFloat = 20

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            VStack(alignment: .leading, spacing: 12) {
                EmojiLabel(emoji: term.emoji, label: term.label, markSide: markSide)
                    .font(.headline)
                    .lineLimit(3)
                Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 8) {
                    GridRow {
                        key("Status")
                        HStack(spacing: 6) {
                            Circle()
                                .frame(width: 7, height: 7)
                                .agentTone(agent)
                                .foregroundStyle(agent.state.tint)
                            Text(agent.stateLabel)
                                .agentTone(agent)
                                .foregroundStyle(agent.state.tint)
                        }
                    }
                    if let since = agent.since {
                        GridRow {
                            key(agent.pause != nil ? "Worked" : agent.until == nil ? "For" : "Took")
                            timing(since: since, now: Int(context.date.timeIntervalSince1970 * 1000))
                        }
                    }
                    if let pause = agent.pause {
                        GridRow(alignment: .top) {
                            key("Waits on")
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(Array(pause.shells.enumerated()), id: \.offset) { _, shell in
                                    Text(shell).lineLimit(2)
                                }
                            }
                        }
                    }
                    GridRow {
                        key("Agent")
                        Text(agent.provider)
                    }
                }
                .font(.subheadline)
            }
            .padding(16)
            .frame(width: 300, alignment: .leading)
        }
    }

    private func key(_ text: String) -> some View {
        Text(text).foregroundStyle(.secondary)
    }

    private func timing(since: Int, now: Int) -> some View {
        let mark = agent.until ?? agent.pause?.since ?? since
        let clock = Date(timeIntervalSince1970: Double(mark) / 1000)
            .formatted(date: .omitted, time: .shortened)
        return HStack(spacing: 4) {
            Text(agent.elapsed(now: now) ?? "")
                .monospacedDigit()
            Text("· \(agent.pause != nil ? "stopped" : agent.until == nil ? "since" : "ended") \(clock)")
                .foregroundStyle(.secondary)
        }
        .lineLimit(1)
    }
}
