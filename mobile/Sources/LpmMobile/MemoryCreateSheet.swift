import SwiftUI

/// Starts a new session memory. The typed title becomes both the document's
/// heading and the short name agents resume it by, and the new document is seeded
/// with the headings the memory skill expects so an agent can append to it
/// straight away.
struct MemoryCreateSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: String
    /// The project these sessions belong to, by display name — the original when
    /// this project is a copy of it.
    let ownerLabel: String
    let onCreated: (String) -> Void

    @State private var title = ""
    @FocusState private var focused: Bool

    private var slug: String { Wire.slugify(title) }
    private var saving: Bool { model.memory.saving.contains(model.memory.key(project, slug)) }
    private var existing: MemorySession? {
        model.memory.sessions(project).first { $0.name == slug }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What is this session about?", text: $title)
                        .focused($focused)
                        .submitLabel(.done)
                        .onSubmit { create() }
                } header: {
                    Text("Title")
                } footer: {
                    if slug.isEmpty {
                        Text("Agents pick a session up by its short name, so give it a few plain words.")
                    } else {
                        preview
                    }
                }
            }
            .navigationTitle("New Session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Create") { create() }
                            .fontWeight(.semibold)
                            .disabled(slug.isEmpty)
                    }
                }
            }
        }
        .interactiveDismissDisabled(saving)
        .task {
            try? await Task.sleep(nanoseconds: 350_000_000)
            focused = true
        }
        .onChange(of: model.memory.createdName[project]) { _, created in
            guard let created, !created.isEmpty else { return }
            model.memory.consumeCreated(project)
            onCreated(created)
            dismiss()
        }
        .alert("Couldn't create session", isPresented: createErrorPresented) {
            Button("OK", role: .cancel) { model.memory.consumeSaveError(project, name: slug) }
        } message: {
            Text(model.memory.saveError[model.memory.key(project, slug)] ?? "")
        }
    }

    private var preview: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(slug)
                .font(.footnote.monospaced())
                .foregroundStyle(.primary)
            Text(existing == nil
                 ? "Any agent working in \(ownerLabel) can pick this session up by that name."
                 : "\(ownerLabel) already has a session with that name — Create opens it.")
        }
    }

    /// Reusing an existing name opens that session instead of overwriting it: the
    /// create path carries no baseline, so a save here would replace the agent's
    /// work outright.
    private func create() {
        guard !slug.isEmpty, !saving else { return }
        if existing != nil {
            onCreated(slug)
            dismiss()
            return
        }
        model.memory.create(project, name: slug, content: skeleton)
    }

    private var skeleton: String {
        let heading = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return "# \(heading)\n\n## Goal\n\n\n## Current state\n\n\n## Timeline\n"
    }

    private var createErrorPresented: Binding<Bool> {
        Binding(get: { !slug.isEmpty && model.memory.saveError[model.memory.key(project, slug)] != nil },
                set: { if !$0 { model.memory.consumeSaveError(project, name: slug) } })
    }
}
