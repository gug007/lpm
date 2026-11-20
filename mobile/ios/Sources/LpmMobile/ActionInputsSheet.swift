import SwiftUI

/// Collects an action's declared inputs before it runs (mirrors the desktop inputs
/// modal). Values are relayed as-is; the Mac substitutes them into the command's
/// `{{key}}` tokens. If the action also needs confirmation, the button reads "Next"
/// and the confirm modal follows.
struct ActionInputsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let action: Action
    /// Values to start with, ahead of the defaults (a page's `lpm.run`).
    var initial: [String: String] = [:]
    let onSubmit: ([String: String]) -> Void

    @State private var values: [String: String] = [:]

    private func value(_ input: ActionInput) -> String {
        (values[input.key] ?? input.defaultValue).trimmingCharacters(in: .whitespacesAndNewlines)
    }
    private var canSubmit: Bool {
        action.inputs.allSatisfy { !$0.required || !value($0).isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                ForEach(action.inputs) { input in
                    Section {
                        if input.isSelect {
                            // Every option on its own row, as the desktop lists its
                            // radio buttons; the section header already names it.
                            Picker(input.label, selection: binding(for: input)) {
                                ForEach(input.options) { opt in
                                    Text(opt.label).tag(opt.value)
                                }
                            }
                            .pickerStyle(.inline)
                            .labelsHidden()
                        } else if input.isSecret {
                            SecureField(input.placeholder.isEmpty ? input.label : input.placeholder,
                                        text: binding(for: input))
                        } else {
                            TextField(input.placeholder.isEmpty ? input.label : input.placeholder,
                                      text: binding(for: input), axis: .vertical)
                                .lineLimit(1...4)
                                .autocorrectionDisabled()
                                .textInputAutocapitalization(.never)
                        }
                    } header: {
                        HStack(spacing: 3) {
                            Text(input.label)
                            if input.required { Text("*").foregroundStyle(.red) }
                        }
                    }
                }
            }
            .navigationTitle(action.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action.confirm ? "Next" : "Run") { submit() }.disabled(!canSubmit)
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(Color(.systemBackground))
        .onAppear {
            for input in action.inputs where values[input.key] == nil {
                if let given = initial[input.key] {
                    values[input.key] = given
                } else if input.isSelect && input.defaultValue.isEmpty {
                    values[input.key] = input.options.first?.value ?? ""
                } else {
                    values[input.key] = input.defaultValue
                }
            }
        }
    }

    private func binding(for input: ActionInput) -> Binding<String> {
        Binding(get: { values[input.key] ?? input.defaultValue },
                set: { values[input.key] = $0 })
    }
    private func submit() {
        var out: [String: String] = [:]
        for input in action.inputs { out[input.key] = values[input.key] ?? input.defaultValue }
        onSubmit(out)
        dismiss()
    }
}
