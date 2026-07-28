import SwiftUI

/// Session memory for one project: the work logs agents write when they hand off
/// and read back when they pick the work up again, newest first. Pushed from the
/// project menu, so it sets only an inline title.
///
/// A duplicate reads and writes its original's memory — the Mac decides that, and
/// the store reports it as `isShared`, which this screen surfaces as a chip so the
/// user knows edits here are visible from the other project too.
struct MemoryScreen: View {
    @Environment(AppModel.self) private var model

    let project: Project

    @State private var creating = false
    @State private var openName: String?
    @State private var pendingDelete: MemorySession?
    @State private var deletingName: String?

    private var name: String { project.name }
    private var sessions: [MemorySession] { model.memory.sessions(name) }

    /// The project these sessions belong to, by its display name: this project, or
    /// the original when this one is a copy.
    private var ownerLabel: String {
        let owner = model.memory.owner(name)
        guard !owner.isEmpty, owner != name else { return project.label }
        return model.projects.first { $0.name == owner }?.label ?? owner
    }

    var body: some View {
        List {
            if model.memory.isShared(name) {
                Label("Shared with \(ownerLabel)", systemImage: "arrow.triangle.branch")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .listRowSeparator(.hidden)
            }
            ForEach(sessions) { session in
                NavigationLink {
                    MemorySessionView(project: name, name: session.name, title: session.title)
                } label: {
                    MemorySessionRow(title: session.title,
                                     subtitle: subtitle(session),
                                     stamp: stamp(session))
                        .equatable()
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) { pendingDelete = session } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationTitle("Memory")
        .navigationBarTitleDisplayMode(.inline)
        .overlay { stateOverlay }
        .refreshable { await refresh() }
        .task { model.memory.screenDidOpen(name) }
        .onDisappear { model.memory.screenDidClose(name) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { creating = true } label: { Image(systemName: "plus") }
                    .accessibilityLabel("New session")
            }
        }
        .navigationDestination(item: $openName) { slug in
            MemorySessionView(project: name, name: slug, title: title(of: slug))
        }
        .sheet(isPresented: $creating) {
            MemoryCreateSheet(project: name, ownerLabel: ownerLabel) { slug in
                // The push has to wait for the sheet to finish dismissing —
                // SwiftUI drops a navigation raised in the same beat.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { openName = slug }
            }
            .environment(model)
        }
        .confirmationDialog("Delete session?", isPresented: deleteConfirmPresented,
                            titleVisibility: .visible, presenting: pendingDelete) { session in
            Button("Delete", role: .destructive) { confirmDelete(session) }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: { session in
            Text("“\(session.title)” will be gone for good — agents won't be able to pick this work up again.")
        }
        .alert("Couldn't delete session", isPresented: deleteErrorPresented) {
            Button("OK", role: .cancel) { clearDeleteError() }
        } message: {
            Text(deleteError ?? "")
        }
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if sessions.isEmpty {
            if model.memory.lists[name] == nil, model.memory.listLoading.contains(name) {
                ProgressView()
            } else if let error = model.memory.listError[name] {
                ContentUnavailableView {
                    Label("Couldn't load memory", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { model.memory.load(name) }
                        .buttonStyle(.borderedProminent)
                }
            } else {
                ContentUnavailableView {
                    Label("No memory yet", systemImage: "brain")
                } description: {
                    Text("Ask an agent to remember the session, or start one here — any agent can pick it up later and continue the work.")
                } actions: {
                    Button("New Session") { creating = true }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    private var deleteConfirmPresented: Binding<Bool> {
        Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } })
    }

    private var deleteError: String? {
        guard let deletingName else { return nil }
        return model.memory.deleteError[model.memory.key(name, deletingName)]
    }

    private var deleteErrorPresented: Binding<Bool> {
        Binding(get: { deleteError != nil }, set: { if !$0 { clearDeleteError() } })
    }

    private func clearDeleteError() {
        if let deletingName {
            model.memory.deleteError[model.memory.key(name, deletingName)] = nil
        }
        deletingName = nil
    }

    private func confirmDelete(_ session: MemorySession) {
        pendingDelete = nil
        deletingName = session.name
        model.memory.delete(name, name: session.name)
    }

    private func refresh() async {
        model.memory.load(name)
        try? await Task.sleep(nanoseconds: 600_000_000)
    }

    private func title(of slug: String) -> String {
        sessions.first { $0.name == slug }?.title ?? slug
    }

    /// What this workstream is about: the first line of its goal, falling back to
    /// the name agents resume it by when that differs from the title.
    private func subtitle(_ session: MemorySession) -> String {
        let goal = memoryGoalLine(session.content)
        if !goal.isEmpty { return goal }
        return session.name == session.title ? "" : session.name
    }

    private func stamp(_ session: MemorySession) -> String {
        let agent = memoryLastAgent(session.content)
        let time = relativeMemoryTime(session.updatedAt)
        return agent.isEmpty ? time : "\(agent) · \(time)"
    }
}

private struct MemorySessionRow: View, Equatable {
    let title: String
    let subtitle: String
    let stamp: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Spacer(minLength: 4)
                Text(stamp)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            if !subtitle.isEmpty {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 3)
    }
}

/// A relative time for a session-memory `updatedAt`, which is unix **seconds** —
/// every Notes timestamp is milliseconds, hence the separate helper.
func relativeMemoryTime(_ unixSeconds: Int) -> String {
    guard unixSeconds > 0 else { return "" }
    return Date(timeIntervalSince1970: TimeInterval(unixSeconds))
        .formatted(.relative(presentation: .named))
}

/// The first line under "## Goal" — the document's own one-line answer to what
/// the workstream is about.
func memoryGoalLine(_ content: String) -> String {
    let lines = content.components(separatedBy: "\n")
    guard let start = lines.firstIndex(where: {
        $0.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("## goal")
    }) else { return "" }
    for line in lines[(start + 1)...] {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("##") { break }
        if !trimmed.isEmpty { return trimmed }
    }
    return ""
}

/// The agent named by the newest timeline entry ("### <date> — <agent>"): who
/// remembered last, which is the freshness signal a hand-off decision needs.
func memoryLastAgent(_ content: String) -> String {
    var agent = ""
    for line in content.components(separatedBy: "\n") {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard trimmed.hasPrefix("### "),
              let dash = trimmed.range(of: "—", options: .backwards) else { continue }
        let tail = trimmed[dash.upperBound...].trimmingCharacters(in: .whitespaces)
        if !tail.isEmpty, !tail.contains(" ") { agent = tail }
    }
    return agent
}
