import SwiftUI

/// The core duplicate options, mirroring the desktop modal's backend-backed
/// fields: how many copies to make (1–50), a display label for a single copy,
/// and the three git toggles. Run-on-each-copy and folder grouping are desktop
/// frontend orchestration and intentionally omitted here.
struct DuplicateOptions {
    var count: Int = 1
    var label: String = ""
    var excludeUncommitted: Bool = false
    var pullLatest: Bool = true
    var reinstallDeps: Bool = false
}

/// The mobile equivalent of the desktop "Duplicate project" modal, scoped to the
/// core options. Presented as a sheet from a project row; on confirm it hands the
/// chosen options back to the caller, which sends them to the Mac. New copies
/// stream in via the projects-changed push.
struct DuplicateOptionsView: View {
    let project: Project
    let onConfirm: (DuplicateOptions) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var options = DuplicateOptions()

    private var single: Bool { options.count == 1 }

    private var confirmLabel: String {
        single ? "Create 1 copy" : "Create \(options.count) copies"
    }

    var body: some View {
        NavigationStack {
            Form {
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
                        TextField("Auto-named", text: $options.label)
                            .autocorrectionDisabled()
                            .textInputAutocapitalization(.never)
                    }
                } header: {
                    Text("Copies")
                } footer: {
                    Text(single
                        ? "A label to recognize the copy by. Leave blank to name it automatically."
                        : "Copies are named automatically.")
                }

                Section("Options") {
                    Toggle("Committed work only", isOn: $options.excludeUncommitted)
                    Toggle("Pull latest changes", isOn: $options.pullLatest)
                    Toggle("Reinstall dependencies", isOn: $options.reinstallDeps)
                }

                Section {
                    if options.excludeUncommitted {
                        optionNote("Reset each copy to the last commit, dropping uncommitted changes.")
                    }
                    if options.pullLatest {
                        optionNote("Bring each copy up to the newest commits on its branch.")
                    }
                    if options.reinstallDeps {
                        optionNote("Copy without dependencies, then install them fresh in each copy.")
                    }
                }
                .listRowBackground(Color.clear)
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
        }
    }

    private func optionNote(_ text: String) -> some View {
        Text(text)
            .font(.footnote)
            .foregroundStyle(.secondary)
    }
}
