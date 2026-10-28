import SwiftUI

/// Every terminal a project has going, as one recessed card nested under the
/// project's own row and inset to start beneath its name — so a terminal reads as
/// part of the project above it rather than as another project beside it. Each
/// terminal is a list row of its own drawing its piece of the card, so it can
/// carry swipe actions.
///
/// From a Mac that archives agents (`archivable`), a finished row archives with a
/// swipe, its long-press menu marks it unread once seen (or seen, while the Mac
/// keeps finished agents), and the seen rows past the Mac's limit fold into one
/// line that expands in place.
struct ProjectTerminalDeck: View {
    @Environment(AppModel.self) private var model
    let project: String
    let rows: [ProjectAgentRow]
    var folded = 0
    var expanded = false
    var toggleFold: () -> Void = {}
    var archivable = false
    let indent: CGFloat
    let open: (ProjectAgentRow) -> Void

    var body: some View {
        ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
            agentRow(row)
                .deckPiece(first: index == 0, last: index == rows.count - 1 && folded == 0, indent: indent)
        }
        if folded > 0 {
            SeenAgentsFoldLine(folded: folded, expanded: expanded, toggle: toggleFold)
                .deckPiece(first: rows.isEmpty, last: true, indent: indent)
        }
    }

    @ViewBuilder
    private func agentRow(_ row: ProjectAgentRow) -> some View {
        let button = Button { open(row) } label: {
            ProjectTerminalRow(row: row)
        }
        .buttonStyle(.plain)
        .disabled(row.terminalId == nil)
        if archivable {
            button
                .contextMenu { menu(row) }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    if row.state.isFinished {
                        archiveButton(row).tint(.blue)
                    }
                }
        } else {
            button
        }
    }

    /// A running or waiting agent offers only Open: archiving it would hide work
    /// still going, or a question still waiting on an answer.
    @ViewBuilder
    private func menu(_ row: ProjectAgentRow) -> some View {
        if row.terminalId != nil {
            Button { open(row) } label: {
                Label("Open", systemImage: "terminal")
            }
        }
        if row.state.isFinished {
            if row.seen {
                Button { model.markAgentUnread(row, project: project) } label: {
                    Label("Mark as Unread", systemImage: "envelope.badge")
                }
            } else if model.keepFinishedAgents {
                Button { model.markAgentSeen(row, project: project) } label: {
                    Label("Mark as Seen", systemImage: "envelope.open")
                }
            }
            archiveButton(row)
        }
    }

    private func archiveButton(_ row: ProjectAgentRow) -> some View {
        Button {
            withAnimation { model.archiveAgent(row, project: project) }
        } label: {
            Label("Archive", systemImage: "archivebox")
        }
    }
}

/// The line seen rows past the Mac's limit fold into: it opens them in place,
/// then folds them again.
private struct SeenAgentsFoldLine: View {
    let folded: Int
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        Button {
            withAnimation { toggle() }
        } label: {
            HStack(spacing: 6) {
                Text(expanded ? "Show fewer" : "\(folded) more seen")
                Spacer(minLength: 4)
                Image(systemName: expanded ? "chevron.up" : "chevron.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

private extension View {
    func deckPiece(first: Bool, last: Bool, indent: CGFloat) -> some View {
        modifier(DeckPiece(first: first, last: last, indent: indent))
    }
}

/// One row's piece of the deck's card: rounded where the card's own corners are,
/// with a rule above every row but the first.
private struct DeckPiece: ViewModifier {
    let first: Bool
    let last: Bool
    let indent: CGFloat

    func body(content: Content) -> some View {
        let shape = UnevenRoundedRectangle(topLeadingRadius: first ? 10 : 0, bottomLeadingRadius: last ? 10 : 0,
                                           bottomTrailingRadius: last ? 10 : 0, topTrailingRadius: first ? 10 : 0,
                                           style: .continuous)
        // Filling the cell, which the list can make taller than the row, so the
        // pieces meet with no gap.
        content
            .frame(maxHeight: .infinity)
            .overlay(alignment: .top) {
                if !first {
                    Divider().padding(.leading, 10)
                }
            }
            .background {
                // One step off the row behind it in both appearances — the
                // grouped-secondary tone a list row already uses is identical to it
                // in dark, which would leave the hairline doing all the work.
                shape.fill(Color(.tertiarySystemGroupedBackground))
                    .overlay {
                        // The outline runs on past an edge the next piece joins, so
                        // only the card's own edges show it.
                        shape.strokeBorder(Color(.separator).opacity(0.5), lineWidth: 0.5)
                            .padding(.top, first ? 0 : -1)
                            .padding(.bottom, last ? 0 : -1)
                    }
                    .clipped()
            }
            // The deck hangs flush under its project and starts beneath the project
            // name — the dot's 14pt column plus the stack's spacing.
            .listRowInsets(EdgeInsets(top: 0, leading: 16 + 22 + indent, bottom: last ? 8 : 0, trailing: 16))
            .listRowSeparator(.hidden, edges: last ? .top : .all)
            // Its separator closes the cell in line with every other row's, rather
            // than starting at the deck's own left edge.
            .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
    }
}
