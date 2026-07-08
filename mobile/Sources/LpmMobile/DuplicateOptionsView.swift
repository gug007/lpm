import SwiftUI

/// What to run in each new copy — mirrors the desktop modal's run modes.
enum RunMode: String, CaseIterable {
    case none, action, command
}

/// The duplicate options, mirroring the desktop "Duplicate project" modal: how
/// many copies (1–50), a per-copy display label, an optional sidebar folder to
/// group them under, the three git toggles, and an optional task to run in each
/// copy (an action or a command, plus a text prompt for AI agents). Per-copy run
/// overrides and image attachments are the one desktop feature left out.
struct DuplicateOptions {
    var count: Int = 1
    var labels: [String] = [""]
    var groupName: String = ""
    var excludeUncommitted: Bool = false
    var pullLatest: Bool = true
    var reinstallDeps: Bool = false
    var runMode: RunMode = .none
    var actionName: String = ""
    var command: String = ""
    var prompt: String = ""
}

/// The mobile equivalent of the desktop "Duplicate project" modal. Presented as a
/// sheet from a project row; on confirm it hands the chosen options back to the
/// caller, which sends them to the Mac. New copies stream in via the
/// projects-changed push.
struct DuplicateOptionsView: View {
    let project: Project
    let onConfirm: (DuplicateOptions) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var options: DuplicateOptions

    init(project: Project, defaults: DuplicateOptions, onConfirm: @escaping (DuplicateOptions) -> Void) {
        self.project = project
        self.onConfirm = onConfirm
        // count/label/run always start fresh; the git toggles seed from the
        // desktop's persisted duplicate settings.
        var seed = DuplicateOptions()
        seed.excludeUncommitted = defaults.excludeUncommitted
        seed.reinstallDeps = defaults.reinstallDeps
        seed.pullLatest = defaults.pullLatest
        _options = State(initialValue: seed)
    }

    private var single: Bool { options.count == 1 }

    private var runnableActions: [Action] { project.actions.flatMap { $0.runnableLeaves } }

    private var runModes: [RunMode] {
        runnableActions.isEmpty ? [.none, .command] : RunMode.allCases
    }

    private var confirmLabel: String {
        if options.runMode != .none {
            return single ? "Run on the copy" : "Run on \(options.count) copies"
        }
        return single ? "Create 1 copy" : "Create \(options.count) copies"
    }

    var body: some View {
        NavigationStack {
            Form {
                copiesSection
                if !single {
                    labelsSection
                    folderSection
                }
                runSection
                optionsSection
            }
            .navigationTitle("Duplicate \(project.label)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(confirmLabel) {
                        onConfirm(options)
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onChange(of: options.count) { _, n in syncLabels(to: n) }
            .onChange(of: options.runMode) { _, _ in seedActionIfNeeded() }
        }
    }

    private var copiesSection: some View {
        Section {
            Stepper(value: $options.count, in: 1...50) {
                HStack {
                    Text("Copies")
                    Spacer()
                    Text("\(options.count)")
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                }
            }
            if single {
                TextField("Auto-named", text: $options.labels[0])
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
        } header: {
            Text("Copies")
        } footer: {
            if single {
                Text("A label to recognize the copy by. Leave blank to name it automatically.")
            }
        }
    }

    private var labelsSection: some View {
        Section {
            ForEach(Array(options.labels.indices), id: \.self) { i in
                TextField("Copy \(i + 1) — auto-named", text: $options.labels[i])
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
            }
        } header: {
            Text("Labels")
        } footer: {
            Text("Leave a field blank to name that copy automatically.")
        }
    }

    private var folderSection: some View {
        Section {
            TextField("Folder name (optional)", text: $options.groupName)
                .autocorrectionDisabled()
        } footer: {
            Text("Group the copies under a sidebar folder. Leave blank to keep them loose.")
        }
    }

    private var runSection: some View {
        Section {
            Picker("Run", selection: $options.runMode) {
                ForEach(runModes, id: \.self) { m in
                    Text(runModeLabel(m)).tag(m)
                }
            }
            .pickerStyle(.segmented)

            if options.runMode == .action {
                Picker("Action", selection: $options.actionName) {
                    ForEach(runnableActions) { a in
                        Text(a.emoji.isEmpty ? a.label : "\(a.emoji) \(a.label)").tag(a.name)
                    }
                }
            }
            if options.runMode == .command {
                TextField("Command", text: $options.command, axis: .vertical)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .font(.system(.body, design: .monospaced))
            }
            if options.runMode != .none {
                TextField("Prompt for an AI agent (optional)", text: $options.prompt, axis: .vertical)
                    .lineLimit(1...4)
            }
        } header: {
            Text("Run on each copy")
        } footer: {
            if options.runMode != .none {
                Text("Runs in each new copy's terminal once it's ready. The prompt is sent only if the command starts an AI agent. Requires the lpm app open on your Mac.")
            }
        }
    }

    private var optionsSection: some View {
        Section("Options") {
            Toggle("Committed work only", isOn: $options.excludeUncommitted)
            Toggle("Pull latest changes", isOn: $options.pullLatest)
            Toggle("Reinstall dependencies", isOn: $options.reinstallDeps)
        }
    }

    private func runModeLabel(_ m: RunMode) -> String {
        switch m {
        case .none: return "Nothing"
        case .action: return "Action"
        case .command: return "Command"
        }
    }

    private func syncLabels(to n: Int) {
        if options.labels.count < n {
            options.labels.append(contentsOf: Array(repeating: "", count: n - options.labels.count))
        } else if options.labels.count > n {
            options.labels.removeLast(options.labels.count - n)
        }
    }

    private func seedActionIfNeeded() {
        if options.runMode == .action, options.actionName.isEmpty {
            options.actionName = runnableActions.first?.name ?? ""
        }
    }
}
