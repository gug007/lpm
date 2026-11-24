import SwiftUI

/// The create-pull-request sheet: editable title + body with an AI "generate"
/// helper, and a Create action. Creating pushes first, so it can take a while; on
/// success the PR's URL is shown with an Open button. Presentable from both the
/// review screen and the project screen's Git menu.
struct GitPrSheet: View {
    @Environment(AppModel.self) private var model
    let project: Project
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var body_ = ""
    @State private var createdURL: String?
    @State private var closeIssue = true

    /// The issue the branch was started from, which the pull request closes.
    private var issue: Int? { model.git.snapshots[name]?.issue }
    private var name: String { project.name }
    private var generating: Bool { model.git.generatingPr.contains(name) }
    private var creating: Bool { model.git.creatingPr.contains(name) }
    private var canCreate: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !creating && !generating
    }

    var body: some View {
        NavigationStack {
            Group {
                if let url = createdURL {
                    createdView(url)
                } else {
                    form
                }
            }
            .navigationTitle("Pull Request")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(createdURL == nil ? "Cancel" : "Done") { dismiss() }
                }
                if createdURL == nil {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(action: create) {
                            if creating {
                                ProgressView().controlSize(.small)
                            } else {
                                Text("Create").fontWeight(.semibold)
                            }
                        }
                        .disabled(!canCreate)
                    }
                }
            }
            .onChange(of: model.git.prDraft[name]) { _, draft in
                if let draft {
                    title = draft.title
                    body_ = draft.body
                    model.git.consumePrDraft(name)
                }
            }
            .onChange(of: model.git.createdPrURL[name]) { _, url in
                if let url {
                    createdURL = url
                    model.git.consumeCreatedPrURL(name)
                }
            }
            .alert(
                "Something went wrong",
                isPresented: Binding(get: { model.git.prError[name] != nil },
                                     set: { if !$0 { model.git.prError[name] = nil } })
            ) {
                Button("OK", role: .cancel) { model.git.prError[name] = nil }
            } message: {
                Text(model.git.prError[name] ?? "")
            }
        }
    }

    private var form: some View {
        Form {
            Section {
                TextField("Title", text: $title, axis: .vertical)
                    .lineLimit(1...3)
            } header: {
                Text("Title")
            }
            Section {
                TextField("Description", text: $body_, axis: .vertical)
                    .lineLimit(4...16)
            } header: {
                Text("Description")
            }
            if let issue {
                Section {
                    Toggle("Close #\(String(issue)) on merge", isOn: $closeIssue)
                } footer: {
                    Text("Adds “Closes #\(String(issue))” to the description.")
                }
            }
            Section {
                Button {
                    model.git.genPr(name)
                } label: {
                    HStack(spacing: 8) {
                        if generating {
                            ProgressView().controlSize(.small)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text(generating ? "Generating…" : "Generate with AI")
                    }
                }
                .disabled(generating)
            } footer: {
                Text("Creating a pull request pushes your branch first, so it can take a moment.")
            }
        }
    }

    private func createdView(_ url: String) -> some View {
        ContentUnavailableView {
            Label("Pull request created", systemImage: "checkmark.seal.fill")
        } description: {
            Text(url)
                .font(.footnote)
                .textSelection(.enabled)
        } actions: {
            if let link = URL(string: url) {
                Link(destination: link) {
                    Label("Open in Safari", systemImage: "safari")
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
            }
        }
    }

    private func create() {
        model.git.createPr(name,
                          title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                          body: body_,
                          closeIssue: issue == nil ? nil : closeIssue)
    }
}
