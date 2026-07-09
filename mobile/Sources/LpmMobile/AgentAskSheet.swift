import SwiftUI

/// "Ask agent…" sheet: an editable instruction, a read-only preview of the diff
/// context that will be attached, and a picker of the project's live terminals.
/// Sending builds a prompt and hands it back to the caller, which submits it into
/// the chosen terminal and navigates there.
struct AgentAskSheet: View {
    @EnvironmentObject var model: AppModel
    let project: Project
    let path: String
    let diffText: String
    let onSend: (_ term: TerminalInfo, _ prompt: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var instruction = ""
    @State private var selectedTermId: String?
    @FocusState private var focused: Bool

    private var terminals: [TerminalInfo] { model.terminals[project.name] ?? [] }
    private var selectedTerm: TerminalInfo? {
        terminals.first { $0.id == selectedTermId } ?? terminals.first
    }
    private var canSend: Bool {
        !instruction.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && selectedTerm != nil
    }

    var body: some View {
        NavigationStack {
            Group {
                if terminals.isEmpty {
                    noTerminals
                } else {
                    form
                }
            }
            .navigationTitle("Ask Agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Send") { send() }
                        .fontWeight(.semibold)
                        .disabled(!canSend)
                }
            }
            .onAppear {
                if selectedTermId == nil {
                    selectedTermId = (terminals.first { !$0.cli.isEmpty } ?? terminals.first)?.id
                }
                if !terminals.isEmpty { focused = true }
            }
        }
    }

    private var form: some View {
        Form {
            Section("Instruction") {
                TextField("What should the agent do?", text: $instruction, axis: .vertical)
                    .lineLimit(2...6)
                    .focused($focused)
            }
            Section("Terminal") {
                Picker("Terminal", selection: Binding(
                    get: { selectedTerm?.id ?? "" },
                    set: { selectedTermId = $0 }
                )) {
                    ForEach(terminals) { t in
                        Text(t.emoji.isEmpty ? t.label : "\(t.emoji) \(t.label)").tag(t.id)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }
            Section("Context") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(path)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(previewDiff)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
    }

    private var noTerminals: some View {
        ContentUnavailableView {
            Label("No terminals", systemImage: "terminal")
        } description: {
            Text("Open a terminal for this project first, then ask the agent about these changes.")
        }
    }

    private var previewDiff: String {
        let lines = diffText.split(separator: "\n", omittingEmptySubsequences: false)
        if lines.count > 40 {
            return lines.prefix(40).joined(separator: "\n") + "\n… (\(lines.count - 40) more lines)"
        }
        return diffText.isEmpty ? "(no diff available)" : diffText
    }

    private func send() {
        guard let term = selectedTerm else { return }
        let trimmed = instruction.trimmingCharacters(in: .whitespacesAndNewlines)
        let prompt = "\(trimmed)\n\nRegarding these changes in \(path):\n```diff\n\(diffText)\n```"
        onSend(term, prompt)
    }
}
