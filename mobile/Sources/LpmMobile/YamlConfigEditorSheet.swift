import SwiftUI

/// The configuration layer being edited. Each maps to a distinct file on the Mac.
private enum ConfigLayer: String, CaseIterable, Identifiable {
    case project, repo, global
    var id: String { rawValue }
    var title: String {
        switch self {
        case .project: return "This Project"
        case .repo: return "Shared"
        case .global: return "All Projects"
        }
    }
}

/// A raw text editor for a project's configuration file across its layers. Unlike
/// the structured editors this writes the exact text the user typed, so comments
/// and formatting are preserved (see AppModel.saveConfig). The "Shared" layer is
/// unavailable for projects that live on another machine or outside a git repo;
/// selecting it then shows an explanatory message instead of an editor.
struct YamlConfigEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    let project: Project

    @State private var projectName = ""
    @State private var layer: ConfigLayer = .project
    @State private var editedText = ""
    @State private var originalText = ""
    @State private var loaded = false
    @State private var pendingToken: Int?

    private var dirty: Bool { loaded && model.configAvailable && editedText != originalText }

    private var canSave: Bool {
        dirty && !model.configTextLoading && !model.configMutationInFlight
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("Configuration", selection: $layer) {
                    ForEach(ConfigLayer.allCases) { Text($0.title).tag($0) }
                }
                .pickerStyle(.segmented)
                .padding()

                Divider()

                content
            }
            .navigationTitle("Edit Configuration File")
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
        .onAppear {
            if projectName.isEmpty { projectName = project.name }
            load()
        }
        .onChange(of: layer) { _, _ in load() }
        .onChange(of: model.configText == nil) { _, _ in applyLoadedIfReady() }
        .onChange(of: model.configTextLoading) { _, _ in applyLoadedIfReady() }
        .onChange(of: model.configMutationDoneToken) { _, token in
            guard let pending = pendingToken, token > pending else { return }
            if let saved = model.configSavedName, !saved.isEmpty { projectName = saved }
            Haptics.success()
            dismiss()
        }
        .alert("Couldn't save configuration", isPresented: mutationErrorPresented) {
            Button("OK", role: .cancel) { model.configMutationError = nil }
        } message: {
            Text(model.configMutationError ?? "")
        }
    }

    @ViewBuilder private var content: some View {
        if model.configTextLoading {
            ProgressView("Loading…")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let error = model.configTextError {
            infoState(systemImage: "exclamationmark.triangle",
                      title: "Couldn't load configuration",
                      message: error,
                      onRetry: { load() })
        } else if !model.configAvailable {
            infoState(systemImage: "lock",
                      title: "Not available for this project",
                      message: "This configuration can't be edited from here.")
        } else {
            editor
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 0) {
            if dirty {
                Text("Unsaved changes")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
                    .padding(.top, 8)
            }
            CodeEditorTextView(text: $editedText)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func infoState(systemImage: String, title: String, message: String,
                           onRetry: (() -> Void)? = nil) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(title).font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let onRetry {
                Button("Try Again", action: onRetry)
                    .buttonStyle(.bordered)
            }
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var mutationErrorPresented: Binding<Bool> {
        Binding(get: { model.configMutationError != nil },
                set: { if !$0 { model.configMutationError = nil } })
    }

    private func load() {
        loaded = false
        model.readConfig(project: projectName, layer: layer.rawValue)
    }

    private func applyLoadedIfReady() {
        guard !loaded, !model.configTextLoading, let text = model.configText else { return }
        editedText = text
        originalText = text
        loaded = true
    }

    private func submit() {
        guard canSave else { return }
        Haptics.tap()
        pendingToken = model.configMutationDoneToken
        model.saveConfig(project: projectName, layer: layer.rawValue, content: editedText)
    }
}
