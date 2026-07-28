import SwiftUI

/// The composer's memory picker: ask the agent to remember this conversation, or
/// hand it a saved session to continue from. Mirrors the desktop composer's brain
/// panel — what it writes into the field is the terminal CLI's own invocation, so
/// the agent runs the lpm-memory skill exactly as it would on the Mac.
struct ComposerMemorySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: String
    /// The AI CLI the target terminal runs, as the Mac detected it. Only Claude
    /// Code takes a slash command; every other agent gets the skill-mention form.
    let cli: String
    let onPick: (String) -> Void

    /// Below this a search field is more furniture than help, so the list just
    /// shows a heading instead — the desktop panel draws the line in the same place.
    private static let searchFrom = 4

    @State private var query = ""
    @State private var deleting: MemorySession?

    private var memory: MemoryStore { model.memory }
    private var sessions: [MemorySession] { memory.sessions(project) }
    private var searchable: Bool { sessions.count >= Self.searchFrom }

    private var visible: [MemorySession] {
        let term = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !term.isEmpty else { return sessions }
        return sessions.filter {
            $0.title.lowercased().contains(term) || $0.name.lowercased().contains(term)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                Section { rememberRow }
                if !sessions.isEmpty {
                    Section(searchable ? "" : "Continue a session") {
                        ForEach(visible) { session in
                            sessionRow(session)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .modifier(MemorySearch(enabled: searchable, query: $query))
            .overlay { emptyState }
            .task { memory.load(project) }
            .confirmationDialog(
                "Delete session?",
                isPresented: Binding(get: { deleting != nil },
                                     set: { if !$0 { deleting = nil } }),
                titleVisibility: .visible,
                presenting: deleting
            ) { session in
                Button("Delete", role: .destructive) {
                    Haptics.warning()
                    memory.delete(project, name: session.name)
                }
                Button("Cancel", role: .cancel) {}
            } message: { session in
                Text("\(session.title) will be gone for good — agents won't be able to pick this work up again.")
            }
        }
    }

    private var rememberRow: some View {
        Button {
            Haptics.tap()
            onPick(invocation(for: ""))
            dismiss()
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "brain")
                    .font(.system(size: 18))
                    .foregroundStyle(SwiftUI.Color.accentColor)
                    .frame(width: 24)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Remember this conversation")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.primary)
                    Text("The agent writes down the goal, decisions, and next steps — and keeps it updated as you work. Any agent can continue from it later.")
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.leading)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func sessionRow(_ session: MemorySession) -> some View {
        Button {
            Haptics.tap()
            onPick(invocation(for: session.name))
            dismiss()
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.title)
                        .font(.system(size: 15))
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                    Text(relativeMemoryTime(session.updatedAt))
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                NavigationLink {
                    MemorySessionView(project: project, name: session.name, title: session.title)
                        .environment(model)
                } label: {
                    Image(systemName: "eye")
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .fixedSize()
            }
        }
        .swipeActions(edge: .trailing) {
            Button(role: .destructive) { deleting = session } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    @ViewBuilder private var emptyState: some View {
        if sessions.isEmpty, !memory.listLoading.contains(project) {
            ContentUnavailableView(
                "Nothing saved yet",
                systemImage: "brain",
                description: Text("Sessions you save show up here.")
            )
            .allowsHitTesting(false)
        } else if !visible.isEmpty || sessions.isEmpty {
            EmptyView()
        } else {
            ContentUnavailableView.search(text: query)
        }
    }

    /// `/lpm-memory <id>` runs the skill in Claude Code; every other agent gets
    /// the skill-mention form `$lpm-memory <id>` (Codex's syntax, and inert but
    /// self-describing text elsewhere). The bare command means "remember this
    /// conversation" and is complete on its own, so it keeps no trailing space.
    private func invocation(for session: String) -> String {
        let cmd = cli == "claude" ? "/lpm-memory" : "$lpm-memory"
        return session.isEmpty ? cmd : "\(cmd) \(session) "
    }
}

/// `.searchable` can't be applied conditionally inline without changing the view's
/// identity on every list mutation, which drops the field mid-keystroke.
private struct MemorySearch: ViewModifier {
    let enabled: Bool
    @Binding var query: String

    func body(content: Content) -> some View {
        if enabled {
            content.searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always),
                               prompt: "Search sessions")
        } else {
            content
        }
    }
}
