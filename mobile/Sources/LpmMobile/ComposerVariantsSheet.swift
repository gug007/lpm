import SwiftUI

/// The rewrite variants picker (transform with N > 1): each arriving variant is an
/// editable text card; "Use this" commits it into the composer. Failed variants
/// show their error. Dismissing without choosing leaves the composer text
/// unchanged.
struct ComposerVariantsSheet: View {
    @ObservedObject var store: ComposerStore
    @Environment(\.dismiss) private var dismiss

    // Editable drafts keyed by variant id, seeded as variants stream in so typing
    // in one card doesn't get clobbered by a later arrival.
    @State private var drafts: [UUID: String] = [:]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(store.variants) { variant in
                        if let text = variant.text {
                            VariantCard(
                                index: variant.idx,
                                text: Binding(
                                    get: { drafts[variant.id] ?? text },
                                    set: { drafts[variant.id] = $0 }),
                                use: { store.applyVariant(drafts[variant.id] ?? text) })
                        } else {
                            FailedVariantCard(index: variant.idx, error: variant.error ?? "Failed")
                        }
                    }
                    if store.transforming {
                        HStack(spacing: 8) {
                            ProgressView().controlSize(.small)
                            Text("Generating more…").font(.footnote).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                    }
                }
                .padding()
            }
            .navigationTitle("Pick a rewrite")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { store.cancelTransform(); dismiss() }
                }
            }
            .onChange(of: store.variants.count) { _, _ in seedDrafts() }
            .onAppear { seedDrafts() }
        }
        .presentationDetents([.large])
        .preferredColorScheme(.dark)
    }

    private func seedDrafts() {
        for v in store.variants {
            if let text = v.text, drafts[v.id] == nil { drafts[v.id] = text }
        }
    }
}

private struct VariantCard: View {
    let index: Int
    @Binding var text: String
    let use: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Variant \(index + 1)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Button(action: use) {
                    Label("Use this", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 13, weight: .semibold))
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
            }
            TextEditor(text: $text)
                .font(.system(size: 15))
                .frame(minHeight: 90, maxHeight: 220)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(SwiftUI.Color.white.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .padding(14)
        .background(SwiftUI.Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
            .strokeBorder(SwiftUI.Color.white.opacity(0.08)))
    }
}

private struct FailedVariantCard: View {
    let index: Int
    let error: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text("Variant \(index + 1) failed")
                    .font(.system(size: 13, weight: .semibold))
                Text(error)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            Spacer()
        }
        .padding(14)
        .background(SwiftUI.Color.orange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
