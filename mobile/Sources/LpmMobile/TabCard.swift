import SwiftUI

/// One terminal card: a terminal-glyph icon tile and the tab name (prefixed with
/// the tab's emoji when set), over what the agent in it is doing when one
/// reports — the state, how long it has been so, and the agent's name. Tapping
/// the card opens the terminal; the same tab actions as the desktop live on
/// native swipe gestures (Pin from the leading edge; Rename / Close from the
/// trailing edge).
struct TabCard: View {
    let term: TerminalInfo
    /// What the agent in this tab reports, nil for a plain shell.
    let agent: ProjectAgentRow?
    /// Unix millis, ticked by the list so a running reading stays live.
    let now: Int
    let onOpen: () -> Void

    private var title: String {
        term.emoji.isEmpty ? term.label : "\(term.emoji) \(term.label)"
    }
    private var working: Bool { agent?.state == .working }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 16) {
                Image(systemName: "terminal.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    titleText
                    if let agent {
                        TabAgentLine(agent: agent, now: now)
                    }
                }

                Spacer(minLength: 8)

                if term.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                if term.remote {
                    Text("Remote")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
                if let agent {
                    TabAgentMark(state: agent.state)
                }
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(agent.map { "\(term.label), \($0.state.label)" } ?? term.label)
    }

    /// The name sweeps while the work runs, as it does in the projects list.
    @ViewBuilder
    private var titleText: some View {
        let text = Text(title)
            .font(.system(size: 17, weight: .semibold))
            .foregroundStyle(working ? AnyShapeStyle(Color.blue) : AnyShapeStyle(.primary))
            .lineLimit(1)
        if working {
            text.shimmer()
        } else {
            text
        }
    }
}

/// "Needs you · 4m · Claude Code" under a tab's name: the state in its colour,
/// how long it has been true, and which agent says so.
private struct TabAgentLine: View {
    let agent: ProjectAgentRow
    let now: Int

    private var elapsed: String? {
        guard let since = agent.since else { return nil }
        return shortDuration(millis: (agent.until ?? now) - since)
    }

    var body: some View {
        HStack(spacing: 4) {
            Text(agent.state.label)
                .fontWeight(.semibold)
                .foregroundStyle(agent.state.tint)
            if let elapsed {
                Text("·")
                Text(elapsed).monospacedDigit()
            }
            Text("·")
            Text(agent.provider)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}

/// The mark a tab card ends with: a pulsing bell while the agent waits on you, a
/// red mark for a problem, a check once the turn lands. Work in progress says so
/// through the name alone.
private struct TabAgentMark: View {
    let state: AgentState

    var body: some View {
        switch state {
        case .needsYou:
            Image(systemName: "bell.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(state.tint)
                .symbolEffect(.pulse)
        case .error:
            Image(systemName: "exclamationmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(state.tint)
        case .done:
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(state.tint)
        case .working, .idle:
            EmptyView()
        }
    }
}
