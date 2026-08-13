import SwiftUI

/// One terminal inside a project's deck: the tab's own name over a subtitle reading
/// the state, how long it has been that way, and — when the tab was renamed away
/// from its agent — which agent is running in it.
struct ProjectTerminalRow: View {
    let row: ProjectAgentRow
    /// Unix millis, ticked by the list so a running reading stays live.
    let now: Int

    private var elapsed: String? {
        guard let since = row.since else { return nil }
        return shortDuration(millis: (row.until ?? now) - since)
    }

    /// An unrenamed tab is already called after its agent, so naming the agent again
    /// would just say "Claude Code · Claude Code".
    private var provider: String? {
        row.title == row.provider ? nil : row.provider
    }

    var body: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                title
                subtitle
            }
            Spacer(minLength: 4)
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.title), \(row.state.label)")
    }

    /// The name sweeps while the work runs; every other state is said in the
    /// subtitle rather than by tinting the name.
    @ViewBuilder
    private var title: some View {
        let text = Text(row.title)
            .font(.subheadline)
            .foregroundStyle(row.state == .working ? AnyShapeStyle(Color.blue) : AnyShapeStyle(.primary))
            .lineLimit(1)
        if row.state == .working {
            text.shimmer()
        } else {
            text
        }
    }

    private var subtitle: some View {
        HStack(spacing: 4) {
            Text(row.state.label)
                .fontWeight(.semibold)
                .foregroundStyle(row.state.tint)
            if let elapsed {
                Text("·")
                Text(elapsed).monospacedDigit()
            }
            if let provider {
                Text("·")
                Text(provider)
            }
        }
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}
