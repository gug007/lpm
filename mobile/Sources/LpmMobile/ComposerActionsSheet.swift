import SwiftUI

/// The "Rewrite with AI" sheet: the user's enabled composer actions plus a
/// free-form instruction field. Each row has a 1–5 variants stepper (remembered
/// per action for the session). Running dismisses the sheet and kicks off a
/// `transform` on the store; the composer shows the in-progress lock and, for N>1,
/// the variants picker.
struct ComposerActionsSheet: View {
    @Environment(AppModel.self) private var model
    @ObservedObject var store: ComposerStore
    @Environment(\.dismiss) private var dismiss

    @State private var freeform = ""

    /// Map an action's `icon` key to an SF Symbol; unknown keys get a sensible
    /// wand default.
    private func symbol(_ icon: String) -> String {
        switch icon {
        case "sparkles": return "sparkles"
        case "minimize": return "arrow.down.right.and.arrow.up.left"
        case "spellcheck": return "textformat.abc.dottedunderline"
        case "code": return "chevron.left.forwardslash.chevron.right"
        case "zap": return "bolt.fill"
        default: return "wand.and.stars"
        }
    }

    private func variants(for key: String) -> Int { model.actionVariantCounts[key] ?? 1 }
    private func setVariants(_ n: Int, for key: String) {
        model.actionVariantCounts[key] = max(1, min(5, n))
    }

    private func run(instruction: String, key: String) {
        let n = variants(for: key)
        dismiss()
        store.startTransform(instruction: instruction, variants: n)
    }

    var body: some View {
        NavigationStack {
            List {
                if !model.composerActions.isEmpty {
                    Section("Quick rewrites") {
                        ForEach(model.composerActions) { action in
                            ActionRow(symbol: symbol(action.icon),
                                      label: action.label,
                                      variants: variants(for: action.id),
                                      setVariants: { setVariants($0, for: action.id) },
                                      run: { run(instruction: action.instruction, key: action.id) })
                        }
                    }
                }
                Section("Custom") {
                    TextField("Ask AI to rewrite…", text: $freeform, axis: .vertical)
                        .lineLimit(1...4)
                        .autocorrectionDisabled()
                    HStack {
                        VariantStepper(count: variants(for: freeformKey),
                                       set: { setVariants($0, for: freeformKey) })
                        Spacer()
                        Button {
                            run(instruction: freeform, key: freeformKey)
                        } label: {
                            Label("Rewrite", systemImage: "wand.and.stars")
                        }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)
                        .disabled(freeform.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
            }
            .navigationTitle("Rewrite with AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.dark)
    }

    private let freeformKey = "__freeform__"
}

private struct ActionRow: View {
    let symbol: String
    let label: String
    let variants: Int
    let setVariants: (Int) -> Void
    let run: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 15))
                .foregroundStyle(SwiftUI.Color.accentColor)
                .frame(width: 24)
            Text(label)
                .font(.system(size: 15))
                .lineLimit(1)
            Spacer(minLength: 8)
            VariantStepper(count: variants, set: setVariants)
            Button(action: run) {
                Image(systemName: "arrow.right.circle.fill")
                    .font(.system(size: 24))
                    .symbolRenderingMode(.hierarchical)
                    .foregroundStyle(SwiftUI.Color.accentColor)
            }
            .buttonStyle(.plain)
        }
    }
}

/// The −N+ variants control (1–5), shown per action row.
private struct VariantStepper: View {
    let count: Int
    let set: (Int) -> Void

    var body: some View {
        HStack(spacing: 8) {
            button("minus", enabled: count > 1) { set(count - 1) }
            Text("\(count)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .monospacedDigit()
                .frame(minWidth: 14)
            button("plus", enabled: count < 5) { set(count + 1) }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(SwiftUI.Color.white.opacity(0.08))
        .clipShape(Capsule())
    }

    private func button(_ symbol: String, enabled: Bool, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 11, weight: .bold))
                .frame(width: 18, height: 18)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(enabled ? SwiftUI.Color.primary : SwiftUI.Color.secondary.opacity(0.4))
        .disabled(!enabled)
    }
}
