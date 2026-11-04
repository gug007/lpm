import SwiftUI

/// A skill not made in lpm: what it does and which agents can use it. Its text can
/// only be read here; it can be filed in a folder, or converted to an lpm skill.
struct OtherSkillScreen: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: String
    let scope: LpmCommandScope
    let name: String

    @State private var error: String?

    private var store: LpmCommandsStore { model.lpmCommands }
    private var list: LpmCommandList? { store.lists[project]?.list(scope) }
    private var skill: OtherSkill? { list?.others.first { $0.name == name } }

    var body: some View {
        List {
            if let skill {
                if !skill.description.isEmpty {
                    Section { Text(skill.description) }
                }
                if model.lpmOtherSkillsAvailable, let list {
                    Section {
                        Picker("Folder", selection: folderBinding(skill)) {
                            Text("No folder").tag(String?.none)
                            ForEach(list.folders, id: \.self) { Text($0).tag(String?.some($0)) }
                        }
                    }
                }
                Section("Works in") {
                    ForEach(skill.reach, id: \.label) { agent in
                        HStack {
                            Text(agent.label).foregroundStyle(agent.reads ? .primary : .secondary)
                            Spacer()
                            if agent.reads {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(.green)
                                    .accessibilityLabel("Works")
                            }
                        }
                    }
                }
                if !skill.preview.isEmpty {
                    Section("Instructions") {
                        Text(skill.preview)
                            .font(.system(.footnote, design: .monospaced))
                            .foregroundStyle(.secondary)
                            .textSelection(.enabled)
                    }
                }
                Section {
                    Text(skill.path)
                        .font(.system(.caption, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                } footer: {
                    Text("Not made in lpm, so it's read-only here.")
                }
                if model.lpmOtherSkillsAvailable {
                    Section {
                        Button("Convert to lpm skill") { convert() }
                    }
                }
            }
        }
        .navigationTitle("/\(name)")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Couldn't change skills", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } }),
               presenting: error) { _ in
            Button("OK", role: .cancel) {}
        } message: { Text($0) }
    }

    private func folderBinding(_ skill: OtherSkill) -> Binding<String?> {
        Binding(get: { skill.folder }, set: { folder in
            Task {
                do {
                    try await store.moveOther(project, scope: scope, name: name, folder: folder)
                } catch {
                    self.error = error.localizedDescription
                }
            }
        })
    }

    private func convert() {
        Task {
            do {
                try await store.convert(project, scope: scope, name: name, toLpm: true)
                Haptics.success()
                dismiss()
            } catch {
                self.error = error.localizedDescription
                Haptics.error()
            }
        }
    }
}
