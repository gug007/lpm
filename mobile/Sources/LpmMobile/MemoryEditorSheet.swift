import SwiftUI

/// The full-document editor for one session memory. Uses `CodeEditorTextView`
/// rather than SwiftUI's `TextEditor`, which can't turn off smart quotes and
/// dashes and would quietly rewrite the markdown as the user types.
///
/// Saving is compare-and-swap against the text this sheet loaded, so an agent that
/// wrote the same session first is caught instead of overwritten: the store
/// reloads the newer version and this sheet reseeds from it.
struct MemoryEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: String
    let name: String
    let title: String

    @State private var draft = ""
    @State private var baseline = ""
    @State private var seededRevision = -1
    @State private var confirmingDiscard = false

    private var key: String { model.memory.key(project, name) }
    private var revision: Int { model.memory.documentRevision[key] ?? 0 }
    private var saving: Bool { model.memory.saving.contains(key) }
    private var dirty: Bool { draft != baseline }

    var body: some View {
        NavigationStack {
            CodeEditorTextView(text: $draft, ext: "md")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { cancel() }
                            .disabled(saving)
                    }
                    ToolbarItem(placement: .confirmationAction) {
                        if saving {
                            ProgressView()
                        } else {
                            Button("Save") { save() }
                                .fontWeight(.semibold)
                                .disabled(!dirty)
                        }
                    }
                }
        }
        .interactiveDismissDisabled(saving || dirty)
        .onAppear {
            model.memory.beginEditing(project, name: name)
            seed()
        }
        .onDisappear { model.memory.endEditing(project, name: name) }
        .onChange(of: revision) { _, _ in seed() }
        .onChange(of: model.memory.savedTick[key]) { _, tick in
            if tick != nil { dismiss() }
        }
        .confirmationDialog("Discard changes?", isPresented: $confirmingDiscard,
                            titleVisibility: .visible) {
            Button("Discard", role: .destructive) { dismiss() }
            Button("Keep Editing", role: .cancel) {}
        }
        .alert("Session changed on your Mac", isPresented: conflictPresented) {
            Button("OK", role: .cancel) { model.memory.consumeConflict(project, name: name) }
        } message: {
            Text(model.memory.conflictNotice[key] ?? "")
        }
        .alert("Couldn't save session", isPresented: saveErrorPresented) {
            Button("OK", role: .cancel) { model.memory.consumeSaveError(project, name: name) }
        } message: {
            Text(model.memory.saveError[key] ?? "")
        }
    }

    /// Reseed from the held document whenever a newer one arrives — the first
    /// load, a live refresh, or the reload that follows a lost compare-and-swap.
    private func seed() {
        guard seededRevision != revision,
              let content = model.memory.document(project, name: name)?.content else { return }
        seededRevision = revision
        draft = content
        baseline = content
    }

    private func save() {
        model.memory.save(project, name: name, content: draft, baseline: baseline)
    }

    private func cancel() {
        if dirty {
            confirmingDiscard = true
        } else {
            dismiss()
        }
    }

    private var conflictPresented: Binding<Bool> {
        Binding(get: { model.memory.conflictNotice[key] != nil },
                set: { if !$0 { model.memory.consumeConflict(project, name: name) } })
    }

    private var saveErrorPresented: Binding<Bool> {
        Binding(get: { model.memory.saveError[key] != nil },
                set: { if !$0 { model.memory.consumeSaveError(project, name: name) } })
    }
}
