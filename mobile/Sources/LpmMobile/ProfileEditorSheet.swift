import SwiftUI

/// Whether the profile editor is creating a new profile or editing an existing
/// one. Edit carries the profile's current name so the form can seed itself
/// from the project (profiles need no separate read — they ride in the projects
/// push).
enum ProfileEditorContext: Identifiable {
    case create
    case edit(name: String)

    var id: String {
        switch self {
        case .create: return "create"
        case .edit(let name): return "edit:\(name)"
        }
    }

    var isEditing: Bool { if case .edit = self { return true } else { return false } }
    var editingName: String? { if case .edit(let name) = self { return name } else { return nil } }
}

/// Create or edit a profile — a named bundle of services started together.
/// Presented as a sheet from ProjectConfigView; on save it hands the ordered
/// service list to the Mac (see AppModel.saveProfile).
struct ProfileEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: Project
    let context: ProfileEditorContext

    @State private var name = ""
    @State private var selected: [String] = []
    @State private var seeded = false
    @State private var confirmDelete = false
    @State private var pendingToken: Int?

    private var editingName: String? { context.editingName }

    private var allServiceNames: [String] { project.allServices.map(\.name) }

    private var otherProfileNames: [String] {
        project.profiles.map(\.name).filter { $0 != editingName }
    }

    private var validationError: String? {
        let trimmed = name.trimmed
        if trimmed.isEmpty { return "Give this profile a name." }
        if otherProfileNames.contains(trimmed) { return "Another profile already uses that name." }
        if selected.isEmpty { return "Pick at least one service." }
        return nil
    }

    private var canSave: Bool {
        validationError == nil && !model.configMutationInFlight
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                }

                Section {
                    if allServiceNames.isEmpty {
                        Text("Add a service first, then group services into profiles.")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(allServiceNames, id: \.self) { service in
                            Button {
                                toggle(service)
                            } label: {
                                HStack {
                                    Text(service).foregroundStyle(.primary)
                                    Spacer()
                                    if selected.contains(service) {
                                        Image(systemName: "checkmark").foregroundStyle(.tint)
                                    }
                                }
                            }
                        }
                    }
                } header: {
                    Text("Services")
                } footer: {
                    Text("Starting this profile runs exactly these services.")
                }

                if context.isEditing { deleteSection }
            }
            .navigationTitle(context.isEditing ? "Edit Profile" : "Add Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.configMutationInFlight {
                        ProgressView()
                    } else {
                        Button("Save") { submit() }
                            .fontWeight(.semibold)
                            .disabled(!canSave)
                    }
                }
            }
        }
        .interactiveDismissDisabled(model.configMutationInFlight)
        .onAppear(perform: seedIfNeeded)
        .onChange(of: model.configMutationDoneToken) { _, token in
            if let pending = pendingToken, token > pending {
                Haptics.success()
                dismiss()
            }
        }
        .alert("Couldn't save profile", isPresented: mutationErrorPresented) {
            Button("OK", role: .cancel) { model.configMutationError = nil }
        } message: {
            Text(model.configMutationError ?? "")
        }
        .confirmationDialog("Delete this profile?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove it from this project. The services themselves stay. This can't be undone.")
        }
    }

    private var deleteSection: some View {
        Section {
            Button(role: .destructive) {
                Haptics.warning()
                confirmDelete = true
            } label: {
                HStack {
                    Spacer()
                    Text("Delete profile")
                    Spacer()
                }
            }
            .disabled(model.configMutationInFlight)
        }
    }

    private var mutationErrorPresented: Binding<Bool> {
        Binding(get: { model.configMutationError != nil },
                set: { if !$0 { model.configMutationError = nil } })
    }

    private func toggle(_ service: String) {
        if selected.contains(service) { selected.removeAll { $0 == service } }
        else { selected.append(service) }
    }

    private func seedIfNeeded() {
        guard !seeded else { return }
        seeded = true
        if let editing = editingName,
           let profile = project.profiles.first(where: { $0.name == editing }) {
            name = profile.name
            // Preserve the project's service order for a stable, readable list.
            selected = allServiceNames.filter { profile.services.contains($0) }
        }
    }

    private func submit() {
        guard canSave else { return }
        Haptics.tap()
        pendingToken = model.configMutationDoneToken
        let ordered = allServiceNames.filter { selected.contains($0) }
        model.saveProfile(project: project.name, name: name.trimmed,
                          services: ordered, previousName: editingName)
    }

    private func remove() {
        guard let editing = editingName else { return }
        pendingToken = model.configMutationDoneToken
        model.deleteProfile(project: project.name, name: editing)
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
