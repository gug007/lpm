import SwiftUI

/// One task an agent is on, under its project in the list: the state as a mark,
/// the tab it runs in by name, a check once it lands, and how long it took (or has
/// been taking). Mirrors the desktop sidebar's agent rows.
struct ProjectAgentRowView: View {
    let row: ProjectAgentRow
    /// Unix millis, ticked by the list so a running reading stays live.
    let now: Int

    /// The name is the state: it sweeps while the work runs and turns blue when it
    /// lands, so only the two states that want the user need a mark of their own.
    private var mark: String? {
        switch row.state {
        case .needsYou: return "bell.fill"
        case .error: return "exclamationmark.triangle.fill"
        default: return nil
        }
    }

    private var titleTint: SwiftUI.Color {
        switch row.state {
        case .working, .done: return .blue
        case .idle: return .secondary
        default: return .primary
        }
    }

    private var elapsed: String? {
        guard let since = row.since else { return nil }
        return shortDuration(millis: (row.until ?? now) - since)
    }

    var body: some View {
        HStack(spacing: 8) {
            // Held whether or not a mark sits in it — `Color.clear` rather than an
            // empty branch, which would take no space and slide the names left of
            // the project name above them.
            Group {
                if let mark {
                    Image(systemName: mark)
                        .font(.caption2)
                        .foregroundStyle(row.state.tint)
                } else {
                    Color.clear
                }
            }
            .frame(width: 14, height: 14)

            title
            Spacer(minLength: 8)

            if row.state == .done {
                Image(systemName: "checkmark")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.blue)
            }
            if let elapsed {
                Text(elapsed)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(row.title), \(row.state.label)")
    }

    @ViewBuilder
    private var title: some View {
        let text = Text(row.title)
            .font(.subheadline)
            .foregroundStyle(titleTint)
            .lineLimit(1)
        if row.state == .working {
            text.shimmer()
        } else {
            text
        }
    }
}
