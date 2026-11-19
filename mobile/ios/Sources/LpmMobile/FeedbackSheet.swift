import SwiftUI

/// The desktop's Send feedback, on the phone: one box, whose kind follows the
/// text until one is picked, opening a filled-in GitHub issue or discussion that
/// says which versions it's about.
struct FeedbackSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var text = ""
    @State private var picked: FeedbackKind?
    @FocusState private var focused: Bool

    private var kind: FeedbackKind { picked ?? FeedbackDraft.guessKind(text) ?? .suggestion }
    private var title: String { FeedbackDraft.title(text) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What happened, what you'd like, or what you want to know…", text: $text, axis: .vertical)
                        .lineLimit(5...12)
                        .focused($focused)
                } header: {
                    Text("What's on your mind?")
                } footer: {
                    if !title.isEmpty { Text("Title: \(title)") }
                }
                Section {
                    Picker("Kind", selection: Binding(get: { kind }, set: { picked = $0 })) {
                        ForEach(FeedbackKind.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text(kind.hint)
                }
            }
            .navigationTitle("Send Feedback")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button(action: submit) {
                    Label(kind.opens, systemImage: "arrow.up.right.square")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(title.isEmpty)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(.bar)
            }
        }
        .onAppear { focused = true }
    }

    private func submit() {
        let body = text.trimmingCharacters(in: .whitespacesAndNewlines)
            + AppVersions.footer(macVersion: model.macUpdate.version, demo: model.demoMode)
        guard let url = FeedbackDraft.url(kind: kind, title: title, body: body) else { return }
        openURL(url)
        dismiss()
    }
}
