import SwiftUI

/// One session memory document, rendered. The list only carries a preview, so
/// this fetches the full markdown on open and follows it live — an agent writing
/// the same session on the Mac refreshes the text underneath the reader.
struct MemorySessionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: String
    let name: String
    let title: String

    @State private var editing = false
    @State private var confirmingDelete = false

    private var key: String { model.memory.key(project, name) }
    private var document: MemorySession? { model.memory.document(project, name: name) }
    private var loading: Bool { model.memory.documentLoading.contains(key) }
    private var deleting: Bool { model.memory.deleting.contains(key) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // While the editor is open it owns the conflict notice, so the
                // reader doesn't repeat it behind the sheet.
                if !editing, let notice = model.memory.conflictNotice[key] {
                    conflictBanner(notice)
                }
                if let document {
                    stamp(document)
                    MarkdownText(document.content)
                }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .overlay { stateOverlay }
        .navigationTitle(document?.title ?? title)
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await refresh() }
        .task {
            // Claim the project too, not just the session: pushing this view
            // disappeared the list, and a reconnect replays whatever the store
            // holds as active.
            model.memory.screenDidOpen(project)
            model.memory.openSession(project, name: name)
        }
        .onDisappear { model.memory.sessionDidClose(project, name: name) }
        .onChange(of: model.memory.deletedTick[key]) { _, tick in
            if tick != nil { dismiss() }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Edit") { editing = true }
                    .disabled(document == nil || deleting)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button(role: .destructive) { confirmingDelete = true } label: {
                    Image(systemName: "trash")
                }
                .disabled(deleting)
                .accessibilityLabel("Delete session")
            }
        }
        .sheet(isPresented: $editing) {
            MemoryEditorSheet(project: project, name: name, title: document?.title ?? title)
                .environment(model)
        }
        .confirmationDialog("Delete session?", isPresented: $confirmingDelete,
                            titleVisibility: .visible) {
            Button("Delete", role: .destructive) { model.memory.delete(project, name: name) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("“\(document?.title ?? title)” will be gone for good — agents won't be able to pick this work up again.")
        }
        .alert("Couldn't delete session", isPresented: deleteErrorPresented) {
            Button("OK", role: .cancel) { model.memory.deleteError[key] = nil }
        } message: {
            Text(model.memory.deleteError[key] ?? "")
        }
    }

    private func stamp(_ document: MemorySession) -> some View {
        let agent = memoryLastAgent(document.content)
        return VStack(alignment: .leading, spacing: 3) {
            Text(agent.isEmpty
                 ? "Updated \(relativeMemoryTime(document.updatedAt))"
                 : "Updated \(relativeMemoryTime(document.updatedAt)) by \(agent)")
            Text(name)
                .font(.caption2.monospaced())
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    private func conflictBanner(_ notice: String) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: "arrow.triangle.2.circlepath")
            Text(notice)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Dismiss") { model.memory.consumeConflict(project, name: name) }
                .font(.caption.weight(.semibold))
        }
        .font(.caption)
        .padding(10)
        .background(Color(.secondarySystemBackground),
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    @ViewBuilder
    private var stateOverlay: some View {
        if document == nil {
            if loading {
                ProgressView()
            } else if let error = model.memory.documentError[key] {
                ContentUnavailableView {
                    Label("Can't open this session", systemImage: "doc.questionmark")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try Again") { model.memory.openSession(project, name: name) }
                        .buttonStyle(.borderedProminent)
                }
            }
        }
    }

    private var deleteErrorPresented: Binding<Bool> {
        Binding(get: { model.memory.deleteError[key] != nil },
                set: { if !$0 { model.memory.deleteError[key] = nil } })
    }

    private func refresh() async {
        model.memory.openSession(project, name: name)
        try? await Task.sleep(nanoseconds: 600_000_000)
    }
}
