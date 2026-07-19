import SwiftUI

/// Whether the service editor is creating a new service or editing an existing
/// one. Edit carries the service's YAML key so the sheet can fetch its body.
enum ServiceEditorContext: Identifiable {
    case create
    case edit(key: String)

    var id: String {
        switch self {
        case .create: return "create"
        case .edit(let key): return "edit:\(key)"
        }
    }

    var isEditing: Bool { if case .edit = self { return true } else { return false } }
    var editingKey: String? { if case .edit(let key) = self { return key } else { return nil } }
}

/// One environment-variable row in the form. `id` is stable so SwiftUI keeps
/// focus while the user edits either field.
private struct EnvRow: Identifiable {
    let id = UUID()
    var key = ""
    var value = ""
}

/// The service editor's in-flight form state (the mobile analogue of the
/// desktop ServiceForm draft).
private struct ServiceDraft {
    var name = ""
    var cmd = ""
    var cwd = ""
    var port = ""
    var portConflict = ""    // "" (ask) | "free" | "fail"
    var env: [EnvRow] = []
    var dependsOn: [String] = []
}

/// Create or edit a project service. Presented as a sheet from ProjectConfigView;
/// on save it hands the built field map to the Mac (see AppModel.saveService),
/// which writes it to the same layer file a desktop edit would.
struct ServiceEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: Project
    let context: ServiceEditorContext

    @State private var draft = ServiceDraft()
    @State private var seeded = false
    @State private var didRequest = false
    @State private var confirmDelete = false
    @State private var pendingToken: Int?

    private var editingKey: String? { context.editingKey }

    // Other services in the project — for the uniqueness check and the
    // "depends on" toggles (a service can't depend on itself).
    private var otherServiceNames: [String] {
        project.allServices.map(\.name).filter { $0 != editingKey }
    }

    private var loading: Bool {
        context.isEditing && !seeded && model.serviceBodyError == nil
    }

    private var portValid: Bool {
        let trimmed = draft.port.trimmed
        if trimmed.isEmpty { return true }
        guard let n = Int(trimmed) else { return false }
        return n >= 1 && n <= 65535
    }

    private var validationError: String? {
        let name = draft.name.trimmed
        if name.isEmpty { return "Give this service a name." }
        if otherServiceNames.contains(name) { return "Another service already uses that name." }
        if draft.cmd.trimmed.isEmpty { return "Enter a command to start it." }
        if !portValid { return "Enter a port between 1 and 65535." }
        return nil
    }

    private var canSave: Bool {
        validationError == nil && !loading && !model.configMutationInFlight
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading service…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    form
                }
            }
            .navigationTitle(context.isEditing ? "Edit Service" : "Add Service")
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
        .onAppear(perform: seedIfReady)
        .onChange(of: model.serviceBody == nil) { _, _ in seedIfReady() }
        .onChange(of: model.configMutationDoneToken) { _, token in
            if let pending = pendingToken, token > pending {
                Haptics.success()
                dismiss()
            }
        }
        .alert("Couldn't save service", isPresented: mutationErrorPresented) {
            Button("OK", role: .cancel) { model.configMutationError = nil }
        } message: {
            Text(model.configMutationError ?? "")
        }
        .alert("Couldn't load service", isPresented: bodyErrorPresented) {
            Button("OK", role: .cancel) { model.serviceBodyError = nil; dismiss() }
        } message: {
            Text(model.serviceBodyError ?? "")
        }
        .confirmationDialog("Delete this service?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove it from this project and from any profiles that use it. This can't be undone.")
        }
    }

    private var form: some View {
        Form {
            Section {
                TextField("Name", text: $draft.name)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            } footer: {
                Text("Lowercase letters, digits, and dashes.")
            }

            Section("Command") {
                TextField("npm run dev", text: $draft.cmd, axis: .vertical)
                    .lineLimit(1...4)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.system(.body, design: .monospaced))
            }

            advancedSection

            if context.isEditing { deleteSection }
        }
    }

    @ViewBuilder private var advancedSection: some View {
        Section {
            TextField("Working directory (optional)", text: $draft.cwd)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .font(.system(.callout, design: .monospaced))
            TextField("Port (optional)", text: $draft.port)
                .keyboardType(.numberPad)
        } header: {
            Text("Advanced")
        }

        if !draft.port.trimmed.isEmpty {
            Section {
                Picker("When the port is busy", selection: $draft.portConflict) {
                    Text("Ask").tag("")
                    Text("Free it").tag("free")
                    Text("Don't start").tag("fail")
                }
            } footer: {
                Text(portConflictHint)
            }
        }

        if !otherServiceNames.isEmpty {
            Section {
                ForEach(otherServiceNames, id: \.self) { name in
                    Button {
                        toggleDependsOn(name)
                    } label: {
                        HStack {
                            Text(name).foregroundStyle(.primary)
                            Spacer()
                            if draft.dependsOn.contains(name) {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                }
            } header: {
                Text("Depends on")
            } footer: {
                Text("These services start first and turn on automatically with this one.")
            }
        }

        envSection
    }

    private var envSection: some View {
        Section {
            ForEach($draft.env) { $row in
                HStack(spacing: 8) {
                    TextField("KEY", text: $row.key)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .font(.system(.callout, design: .monospaced))
                    Divider()
                    TextField("value", text: $row.value)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .font(.system(.callout, design: .monospaced))
                }
            }
            .onDelete { draft.env.remove(atOffsets: $0) }
            Button {
                draft.env.append(EnvRow())
            } label: {
                Label("Add variable", systemImage: "plus")
            }
        } header: {
            Text("Environment variables")
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
                    Text("Delete service")
                    Spacer()
                }
            }
            .disabled(model.configMutationInFlight)
        }
    }

    private var portConflictHint: String {
        switch draft.portConflict {
        case "free": return "Frees the port automatically before starting."
        case "fail": return "Won't start while the port is in use."
        default: return "Asks before freeing the port."
        }
    }

    // MARK: derived

    private var mutationErrorPresented: Binding<Bool> {
        Binding(get: { model.configMutationError != nil },
                set: { if !$0 { model.configMutationError = nil } })
    }

    private var bodyErrorPresented: Binding<Bool> {
        Binding(get: { model.serviceBodyError != nil },
                set: { if !$0 { model.serviceBodyError = nil } })
    }

    private func toggleDependsOn(_ name: String) {
        if draft.dependsOn.contains(name) { draft.dependsOn.removeAll { $0 == name } }
        else { draft.dependsOn.append(name) }
    }

    // MARK: lifecycle

    private func seedIfReady() {
        guard !seeded else { return }
        switch context {
        case .create:
            model.serviceBody = nil
            seeded = true
        case .edit(let key):
            // Fetch a fresh body; a body left from a previous edit would belong
            // to a different service. The reply lands via the model and re-runs
            // this to seed (mirrors AutomationEditorSheet).
            if !didRequest {
                didRequest = true
                model.loadServiceBody(project: project.name, key: key)
                return
            }
            if let body = model.serviceBody {
                seed(from: body, key: key)
                seeded = true
            }
        }
    }

    private func seed(from body: [String: Any], key: String) {
        var d = ServiceDraft()
        d.name = key
        if let s = body["cmd"] as? String { d.cmd = s }
        if let s = body["cwd"] as? String { d.cwd = s }
        if let n = body["port"] as? Int, n > 0 { d.port = String(n) }
        let conflict = (body["portConflict"] as? String ?? body["port_conflict"] as? String ?? "")
        if conflict == "free" || conflict == "fail" { d.portConflict = conflict }
        if let env = body["env"] as? [String: Any] {
            d.env = env.keys.sorted().map { EnvRow(key: $0, value: String(describing: env[$0] ?? "")) }
        }
        let deps = (body["dependsOn"] as? [Any] ?? body["depends_on"] as? [Any] ?? [])
        d.dependsOn = deps.map { String(describing: $0) }
        draft = d
    }

    // MARK: build & submit

    private func buildPayload() -> [String: Any] {
        var payload: [String: Any] = ["cmd": draft.cmd.trimmed]
        let cwd = draft.cwd.trimmed
        if !cwd.isEmpty { payload["cwd"] = cwd }
        if let n = Int(draft.port.trimmed), n > 0 { payload["port"] = n }
        if draft.portConflict == "free" || draft.portConflict == "fail" {
            payload["portConflict"] = draft.portConflict
        }
        var env: [String: String] = [:]
        for row in draft.env {
            let k = row.key.trimmed
            if !k.isEmpty { env[k] = row.value }
        }
        if !env.isEmpty { payload["env"] = env }
        let deps = draft.dependsOn.filter { otherServiceNames.contains($0) }
        if !deps.isEmpty { payload["dependsOn"] = deps }
        return payload
    }

    private func submit() {
        guard canSave else { return }
        Haptics.tap()
        pendingToken = model.configMutationDoneToken
        let key = draft.name.trimmed
        model.saveService(project: project.name, key: key, payload: buildPayload(),
                          previousKey: editingKey)
    }

    private func remove() {
        guard let key = editingKey else { return }
        pendingToken = model.configMutationDoneToken
        model.deleteService(project: project.name, key: key)
    }
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
