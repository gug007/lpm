import SwiftUI

/// Writes one lpm command: its name, where it lives (a folder of this project's
/// list or the global one, so a save can move it between them), the line the
/// `/` menu shows beside it, and its prompt. The Mac writes the file; its refusal
/// shows at the top.
struct CommandEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: String

    @State private var draft: LpmCommandDraft
    @State private var saving = false
    @State private var error: String?
    @State private var confirmingDelete = false

    init(project: String, draft: LpmCommandDraft) {
        self.project = project
        _draft = State(initialValue: draft)
    }

    private struct Place: Hashable {
        let scope: LpmCommandScope
        let folder: String?
    }

    private var store: LpmCommandsStore { model.lpmCommands }
    private var lists: LpmCommandLists? { store.lists[project] }
    private var isNew: Bool { draft.original == nil }

    private var scopes: [LpmCommandScope] {
        lists?.scopes ?? (draft.scope == .project ? LpmCommandScope.allCases : [.global])
    }

    /// A list's folders, plus the draft's own when the list doesn't have it yet,
    /// so the picker always holds what's selected.
    private func folders(_ scope: LpmCommandScope) -> [String] {
        var folders = lists?.list(scope)?.folders ?? []
        if scope == draft.scope, let own = draft.folder, !folders.contains(own) { folders.append(own) }
        return folders
    }

    /// Only a project's skills live in its repo, and an older lpm can't keep one out.
    private var canKeepOutOfGit: Bool { draft.scope == .project && lists?.project?.inRepo == true }

    /// What keeping a committed skill out of Git will do, said before it's saved.
    private var keptOutNote: String? {
        guard draft.keepOutOfGit, let original = draft.original,
              lists?.list(original.scope)?.commands.first(where: { $0.ref == original })?.tracked == true
        else { return nil }
        return "Already committed. After saving, commit to remove it from the repo. Past commits keep a copy, and other computers lose it when they pull."
    }

    private var place: Binding<Place> {
        Binding(get: { Place(scope: draft.scope, folder: draft.folder) }, set: {
            draft.scope = $0.scope
            draft.folder = $0.folder
        })
    }

    var body: some View {
        NavigationStack {
            Form {
                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
                Section("Name") {
                    HStack(spacing: 1) {
                        Text(verbatim: "/")
                        TextField("fix-ticket", text: $draft.name)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .onChange(of: draft.name) { _, typed in
                                let name = typed.replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
                                if name != typed { draft.name = name }
                            }
                    }
                    .font(.body.monospaced())
                    .foregroundStyle(accentCyan)
                }
                Section {
                    Picker("Folder", selection: place) {
                        ForEach(scopes) { scope in
                            Section(scope.title) {
                                ForEach(folders(scope), id: \.self) { folder in
                                    Text(folder).tag(Place(scope: scope, folder: folder))
                                }
                                Text("No folder").tag(Place(scope: scope, folder: nil))
                            }
                        }
                    }
                }
                Section("Description") {
                    TextField("Shown next to the name in the / menu", text: $draft.description)
                }
                if canKeepOutOfGit {
                    Section {
                        Toggle("Keep out of Git", isOn: $draft.keepOutOfGit)
                    } footer: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Stays in the project folder and is never committed.")
                            if let keptOutNote {
                                Text(keptOutNote).foregroundStyle(.orange)
                            }
                        }
                    }
                }
                Section {
                    TextEditor(text: $draft.body)
                        .frame(minHeight: 160)
                        .autocorrectionDisabled()
                } header: {
                    Text("Prompt")
                } footer: {
                    CommandVariablesHint(prompt: draft.body, name: draft.name)
                }
                if !isNew {
                    Section {
                        if model.lpmOtherSkillsAvailable {
                            Button("Convert to other skill") { convert() }
                                .disabled(saving)
                        }
                        Button("Delete skill", role: .destructive) { confirmingDelete = true }
                            .disabled(saving)
                    }
                }
            }
            .navigationTitle(isNew ? "New skill" : "Edit skill")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Save", action: save)
                            .disabled(!draft.isValid)
                    }
                }
            }
            .alert("Delete /\(draft.original?.name ?? "")?", isPresented: $confirmingDelete) {
                Button("Delete", role: .destructive, action: delete)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Its file is deleted.")
            }
            .interactiveDismissDisabled(saving)
            .onAppear { store.open(project) }
            .onDisappear { store.close(project) }
            // A project without its own list, or whose list can't be read, leaves
            // only the global one.
            .onChange(of: lists?.scopes, initial: true) { _, scopes in
                if let scopes, !scopes.contains(draft.scope) {
                    draft.scope = .global
                    draft.folder = nil
                }
            }
        }
    }

    private func save() {
        let d = draft
        let keepOutOfGit = canKeepOutOfGit ? d.keepOutOfGit : nil
        commit {
            try await store.save(project, place: d.place,
                                 description: d.description.trimmingCharacters(in: .whitespacesAndNewlines),
                                 body: d.body, keepOutOfGit: keepOutOfGit, previous: d.original)
        }
    }

    private func convert() {
        guard let target = draft.original else { return }
        commit { try await store.convert(project, scope: target.scope, name: target.name, toLpm: false) }
    }

    private func delete() {
        guard let target = draft.original else { return }
        commit { try await store.delete(project, target) }
    }

    private func commit(_ op: @escaping () async throws -> Void) {
        saving = true
        error = nil
        Task {
            do {
                try await op()
                Haptics.success()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                Haptics.error()
            }
            saving = false
        }
    }
}
