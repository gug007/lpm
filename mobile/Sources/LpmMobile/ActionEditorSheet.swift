import SwiftUI

/// Whether the action editor is creating a new action or editing an existing
/// one. Edit carries the action's YAML key so the sheet can fetch its body.
enum ActionEditorContext: Identifiable {
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

/// Whether the action is a single command button or a menu of sub-actions.
private enum ActionKind: String, CaseIterable, Identifiable {
    case command, menu
    var id: String { rawValue }
    var title: String { self == .command ? "Command button" : "Menu of sub-actions" }
}

/// Where an action runs. Maps to the YAML `type` field (a plain pop-up run omits
/// it, matching the backend default).
private enum ActionRunIn: String, CaseIterable, Identifiable {
    case popup, terminal, command, background
    var id: String { rawValue }

    var typeValue: String? {
        switch self {
        case .popup: return nil
        case .terminal: return "terminal"
        case .command: return "command"
        case .background: return "background"
        }
    }

    var title: String {
        switch self {
        case .popup: return "Pop-up window"
        case .terminal: return "New terminal tab"
        case .command: return "Current terminal"
        case .background: return "In the background"
        }
    }

    static func from(_ type: String?) -> ActionRunIn {
        switch type {
        case "terminal": return .terminal
        case "command": return .command
        case "background": return .background
        default: return .popup
        }
    }
}

/// Where the action appears in the project's controls.
private enum ActionPlacement: String, CaseIterable, Identifiable {
    case header, footer
    var id: String { rawValue }
    var title: String { self == .header ? "Top bar" : "Bottom bar" }
}

private struct OptionDraft: Identifiable {
    let id = UUID()
    var value = ""
    var label = ""
}

private struct InputDraft: Identifiable {
    let id = UUID()
    var key = ""
    var label = ""
    var type = ""          // "" (text) | "select"
    var required = false
    var placeholder = ""
    var defaultValue = ""
    var options: [OptionDraft] = []
}

private struct ChildDraft: Identifiable {
    let id = UUID()
    var label = ""
    var cmd = ""
    var runIn: ActionRunIn = .terminal
}

private struct ActionDraft {
    var name = ""
    var label = ""
    var emoji = ""
    var kind: ActionKind = .command
    var cmd = ""
    var cwd = ""
    var runIn: ActionRunIn = .terminal
    var reuse = false
    var confirm = false
    var placement: ActionPlacement = .header
    var inputs: [InputDraft] = []
    var children: [ChildDraft] = []
}

/// Create or edit a project action. Presented as a sheet from ProjectConfigView.
/// On save it hands the built action mapping to the Mac (see AppModel.saveAction),
/// which writes it to the same layer file a desktop edit would. Edit mode starts
/// the payload from the action's on-disk body so fields this form doesn't surface
/// (keyboard shortcut, port, position, …) survive the round-trip.
struct ActionEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: Project
    let context: ActionEditorContext

    @State private var draft = ActionDraft()
    @State private var seedBody: [String: Any]?
    @State private var seedSection: String?
    @State private var seeded = false
    @State private var didRequest = false
    @State private var confirmDelete = false
    @State private var pendingToken: Int?

    private var editingKey: String? { context.editingKey }

    private var otherActionKeys: [String] {
        project.actions.map(\.name).filter { $0 != editingKey }
    }

    private var loading: Bool {
        context.isEditing && !seeded && model.actionBodyError == nil
    }

    private var validationError: String? {
        let key = draft.name.trimmed
        if key.isEmpty { return "Give this action a name." }
        if key.contains(":") { return "Names can't contain a colon." }
        if otherActionKeys.contains(key) { return "Another action already uses that name." }
        switch draft.kind {
        case .command:
            if draft.cmd.trimmed.isEmpty { return "Enter a command to run." }
        case .menu:
            if !draft.children.contains(where: { !$0.cmd.trimmed.isEmpty }) {
                return "Add at least one item with a command."
            }
        }
        return nil
    }

    private var canSave: Bool {
        validationError == nil && !loading && !model.configMutationInFlight
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView("Loading action…")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    form
                }
            }
            .navigationTitle(context.isEditing ? "Edit Action" : "Add Action")
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
        .onChange(of: model.actionBody == nil) { _, _ in seedIfReady() }
        .onChange(of: model.configMutationDoneToken) { _, token in
            if let pending = pendingToken, token > pending {
                Haptics.success()
                dismiss()
            }
        }
        .alert("Couldn't save action", isPresented: mutationErrorPresented) {
            Button("OK", role: .cancel) { model.configMutationError = nil }
        } message: {
            Text(model.configMutationError ?? "")
        }
        .alert("Couldn't load action", isPresented: bodyErrorPresented) {
            Button("OK", role: .cancel) { model.actionBodyError = nil; dismiss() }
        } message: {
            Text(model.actionBodyError ?? "")
        }
        .confirmationDialog("Delete this action?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete", role: .destructive) { remove() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Remove it from this project. This can't be undone.")
        }
    }

    private var form: some View {
        Form {
            basicsSection
            kindSection
            if draft.kind == .command {
                commandSection
                inputsSection
            } else {
                childrenSection
            }
            placementSection
            if context.isEditing { deleteSection }
        }
    }

    // MARK: sections

    private var basicsSection: some View {
        Section {
            TextField("Name", text: $draft.name)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            TextField("Label (optional)", text: $draft.label)
            TextField("Emoji (optional)", text: $draft.emoji)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .onChange(of: draft.emoji) { _, v in
                    if let first = v.first, v.count > 1 { draft.emoji = String(first) }
                }
        } footer: {
            Text("The name is how this action is stored. The label is what you see on the button.")
        }
    }

    private var kindSection: some View {
        Section {
            Picker("Type", selection: $draft.kind) {
                ForEach(ActionKind.allCases) { Text($0.title).tag($0) }
            }
        }
    }

    @ViewBuilder private var commandSection: some View {
        Section("Command") {
            TextField("npm run deploy", text: $draft.cmd, axis: .vertical)
                .lineLimit(1...4)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .font(.system(.body, design: .monospaced))
        }

        Section {
            TextField("Working directory (optional)", text: $draft.cwd)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .font(.system(.callout, design: .monospaced))
            Picker("Runs in", selection: $draft.runIn) {
                ForEach(ActionRunIn.allCases) { Text($0.title).tag($0) }
            }
            if draft.runIn == .terminal {
                Toggle("Reuse the same tab", isOn: $draft.reuse)
            }
            Toggle("Ask before running", isOn: $draft.confirm)
        } footer: {
            Text(runInHint)
        }
    }

    private var inputsSection: some View {
        Group {
            ForEach($draft.inputs) { $input in
                Section {
                    inputFields($input)
                    Button("Remove input", role: .destructive) {
                        draft.inputs.removeAll { $0.id == input.id }
                    }
                } header: {
                    Text(input.key.trimmed.isEmpty ? "Input" : input.key.trimmed)
                }
            }
            Section {
                Button {
                    draft.inputs.append(InputDraft())
                } label: {
                    Label("Add input", systemImage: "plus")
                }
            } footer: {
                Text("Values you're asked for before the action runs, filled into the command.")
            }
        }
    }

    @ViewBuilder private func inputFields(_ input: Binding<InputDraft>) -> some View {
        TextField("Name", text: input.key)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .font(.system(.callout, design: .monospaced))
        TextField("Label (optional)", text: input.label)
        Picker("Kind", selection: input.type) {
            Text("Text").tag("")
            Text("Choice").tag("select")
        }
        Toggle("Required", isOn: input.required)
        if input.wrappedValue.type == "select" {
            ForEach(input.options) { $option in
                HStack(spacing: 8) {
                    TextField("Value", text: $option.value)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                    Divider()
                    TextField("Label (optional)", text: $option.label)
                }
            }
            .onDelete { offsets in input.wrappedValue.options.remove(atOffsets: offsets) }
            Button {
                input.wrappedValue.options.append(OptionDraft())
            } label: {
                Label("Add choice", systemImage: "plus")
            }
        } else {
            TextField("Placeholder (optional)", text: input.placeholder)
            TextField("Default value (optional)", text: input.defaultValue)
        }
    }

    private var childrenSection: some View {
        Group {
            ForEach($draft.children) { $child in
                Section {
                    TextField("Label", text: $child.label)
                    TextField("Command", text: $child.cmd, axis: .vertical)
                        .lineLimit(1...4)
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .font(.system(.callout, design: .monospaced))
                    Picker("Runs in", selection: $child.runIn) {
                        ForEach(ActionRunIn.allCases) { Text($0.title).tag($0) }
                    }
                    Button("Remove item", role: .destructive) {
                        draft.children.removeAll { $0.id == child.id }
                    }
                } header: {
                    Text(child.label.trimmed.isEmpty ? "Menu item" : child.label.trimmed)
                }
            }
            Section {
                Button {
                    draft.children.append(ChildDraft())
                } label: {
                    Label("Add item", systemImage: "plus")
                }
            } footer: {
                Text("Each item runs its own command from the menu.")
            }
        }
    }

    private var placementSection: some View {
        Section {
            Picker("Placement", selection: $draft.placement) {
                ForEach(ActionPlacement.allCases) { Text($0.title).tag($0) }
            }
        } header: {
            Text("Placement")
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
                    Text("Delete action")
                    Spacer()
                }
            }
            .disabled(model.configMutationInFlight)
        }
    }

    private var runInHint: String {
        switch draft.runIn {
        case .popup: return "Runs once and shows the output in a pop-up."
        case .terminal: return draft.reuse
            ? "Reuses the same terminal each time."
            : "Opens a new terminal each time."
        case .command: return "Runs in the terminal you're currently using."
        case .background: return "Runs quietly and notifies you when it's done."
        }
    }

    // MARK: derived

    private var mutationErrorPresented: Binding<Bool> {
        Binding(get: { model.configMutationError != nil },
                set: { if !$0 { model.configMutationError = nil } })
    }

    private var bodyErrorPresented: Binding<Bool> {
        Binding(get: { model.actionBodyError != nil },
                set: { if !$0 { model.actionBodyError = nil } })
    }

    // MARK: lifecycle

    private func seedIfReady() {
        guard !seeded else { return }
        switch context {
        case .create:
            model.actionBody = nil
            seeded = true
        case .edit(let key):
            if !didRequest {
                didRequest = true
                model.loadActionBody(project: project.name, key: key)
                return
            }
            if let body = model.actionBody {
                seedBody = body
                seedSection = model.actionBodySection
                seed(from: body, key: key)
                seeded = true
            }
        }
    }

    private func seed(from body: [String: Any], key: String) {
        var d = ActionDraft()
        d.name = key
        if let s = body["label"] as? String { d.label = s }
        if let s = body["emoji"] as? String { d.emoji = s }
        if let s = body["cmd"] as? String { d.cmd = s }
        if let s = body["cwd"] as? String { d.cwd = s }
        d.runIn = ActionRunIn.from(body["type"] as? String)
        d.reuse = (body["reuse"] as? Bool) == true
        d.confirm = (body["confirm"] as? Bool) == true
        d.placement = (body["display"] as? String) == "footer" ? .footer : .header
        if let inputs = body["inputs"] as? [[String: Any]] {
            d.inputs = inputs.map(inputDraft)
        }
        if let children = body["actions"] as? [String: Any], !children.isEmpty {
            d.kind = .menu
            d.children = childDrafts(from: children)
        }
        draft = d
    }

    private func inputDraft(_ o: [String: Any]) -> InputDraft {
        var input = InputDraft()
        input.key = o["key"] as? String ?? ""
        input.label = o["label"] as? String ?? ""
        input.type = (o["type"] as? String) == "select" ? "select" : ""
        input.required = (o["required"] as? Bool) == true
        input.placeholder = o["placeholder"] as? String ?? ""
        input.defaultValue = o["default"] as? String ?? ""
        if let options = o["options"] as? [[String: Any]] {
            input.options = options.map { opt in
                var option = OptionDraft()
                option.value = opt["value"] as? String ?? ""
                option.label = opt["label"] as? String ?? ""
                return option
            }
        }
        return input
    }

    private func childDrafts(from map: [String: Any]) -> [ChildDraft] {
        map.compactMap { name, value -> ChildDraft? in
            guard let v = value as? [String: Any] else { return nil }
            var child = ChildDraft()
            child.label = v["label"] as? String ?? name
            child.cmd = v["cmd"] as? String ?? ""
            child.runIn = ActionRunIn.from(v["type"] as? String)
            return child
        }
        .sorted { $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending }
    }

    // MARK: build & submit

    private func buildPayload() -> [String: Any] {
        // Edit mode starts from the on-disk body so unsurfaced fields survive;
        // create starts empty for the cleanest possible YAML.
        var p: [String: Any] = context.isEditing ? (seedBody ?? [:]) : [:]

        setOrRemove(&p, "label", draft.label.trimmed.nilIfEmpty)
        setOrRemove(&p, "emoji", draft.emoji.trimmed.nilIfEmpty)
        setOrRemove(&p, "display", draft.placement == .footer ? "footer" : nil)

        switch draft.kind {
        case .command:
            p["cmd"] = draft.cmd.trimmed
            setOrRemove(&p, "cwd", draft.cwd.trimmed.nilIfEmpty)
            setOrRemove(&p, "type", draft.runIn.typeValue)
            setOrRemove(&p, "reuse", (draft.runIn == .terminal && draft.reuse) ? true : nil)
            setOrRemove(&p, "confirm", draft.confirm ? true : nil)
            p.removeValue(forKey: "actions")
            let inputs = buildInputs()
            setOrRemove(&p, "inputs", inputs.isEmpty ? nil : inputs)
        case .menu:
            p["actions"] = buildChildMap()
            for key in ["cmd", "cwd", "type", "reuse", "confirm", "port", "portConflict", "inputs"] {
                p.removeValue(forKey: key)
            }
        }
        return p
    }

    private func buildInputs() -> [[String: Any]] {
        draft.inputs.compactMap { input in
            let key = input.key.trimmed
            if key.isEmpty { return nil }
            var m: [String: Any] = ["key": key]
            if !input.label.trimmed.isEmpty { m["label"] = input.label.trimmed }
            if input.type == "select" { m["type"] = "select" }
            if input.required { m["required"] = true }
            if !input.placeholder.trimmed.isEmpty { m["placeholder"] = input.placeholder.trimmed }
            if !input.defaultValue.trimmed.isEmpty { m["default"] = input.defaultValue.trimmed }
            if input.type == "select" {
                let options = input.options.compactMap { opt -> [String: Any]? in
                    let value = opt.value.trimmed
                    if value.isEmpty { return nil }
                    var om: [String: Any] = ["value": value]
                    if !opt.label.trimmed.isEmpty { om["label"] = opt.label.trimmed }
                    return om
                }
                if !options.isEmpty { m["options"] = options }
            }
            return m
        }
    }

    private func buildChildMap() -> [String: Any] {
        var map: [String: Any] = [:]
        var used: Set<String> = []
        for (index, child) in draft.children.enumerated() {
            let cmd = child.cmd.trimmed
            if cmd.isEmpty { continue }
            var key = slugify(child.label)
            if key.isEmpty { key = "option-\(index + 1)" }
            key = uniqueKey(key, taken: used)
            used.insert(key)
            var payload: [String: Any] = [
                "label": child.label.trimmed.isEmpty ? key : child.label.trimmed,
                "cmd": cmd,
            ]
            if let type = child.runIn.typeValue { payload["type"] = type }
            map[key] = payload
        }
        return map
    }

    private func submit() {
        guard canSave else { return }
        Haptics.tap()
        pendingToken = model.configMutationDoneToken
        let key = draft.name.trimmed
        model.saveAction(project: project.name, key: key, payload: buildPayload(),
                        previousKey: editingKey, section: seedSection)
    }

    private func remove() {
        guard let key = editingKey else { return }
        pendingToken = model.configMutationDoneToken
        model.deleteAction(project: project.name, key: key)
    }
}

/// Sets `key` to `value` when non-nil, otherwise removes it — the mobile
/// analogue of the desktop ActionPatch set/remove pair, applied onto the merged
/// payload so cleared fields don't linger. Generic on the element type so an
/// already-optional argument isn't re-wrapped into a non-nil `Any?`.
private func setOrRemove<T>(_ dict: inout [String: Any], _ key: String, _ value: T?) {
    if let value { dict[key] = value } else { dict.removeValue(forKey: key) }
}

private func slugify(_ raw: String) -> String {
    let mapped = raw.lowercased().map { c -> Character in
        c.isLetter || c.isNumber ? c : "-"
    }
    return String(mapped).split(separator: "-").joined(separator: "-")
}

private func uniqueKey(_ base: String, taken: Set<String>) -> String {
    if !taken.contains(base) { return base }
    var n = 2
    while taken.contains("\(base)-\(n)") { n += 1 }
    return "\(base)-\(n)"
}

private extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
