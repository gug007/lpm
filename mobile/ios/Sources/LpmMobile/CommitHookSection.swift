import SwiftUI

/// Why the commit didn't happen when a git hook stopped it, with the ways on (the
/// desktop's `CommitHookPanel`): an agent fixes what it found, try again, or
/// commit without the hooks.
struct CommitHookSection: View {
    let failure: CommitHookFailure
    let tabs: [LaunchpadTab]?
    let busy: Bool
    let onFix: (LaunchpadOption) -> Void
    let onRetry: () -> Void
    let onSkipHooks: () -> Void
    let onDismiss: () -> Void

    @State private var showAll = false
    @State private var confirmSkip = false

    var body: some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.octagon.fill")
                    .foregroundStyle(.red)
                VStack(alignment: .leading, spacing: 2) {
                    Text(failure.headline).font(.subheadline.weight(.semibold))
                    if let summary = failure.summary {
                        Text(summary).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
                Button(action: onDismiss) {
                    Image(systemName: "xmark").font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Back to the commit")
            }
            output
            if let changed = failure.changedText {
                Text(changed).font(.footnote).foregroundStyle(.secondary)
            }
        }
        Section {
            CiFixRows(tabs: tabs, detail: "Opens a new tab with what the hook printed", onFix: onFix)
                .disabled(busy)
            Button(failure.retryLabel, action: onRetry)
                .disabled(busy)
            Button("Commit Without Hooks", role: .destructive) { confirmSkip = true }
                .disabled(busy)
                .confirmationDialog("Commit without hooks?", isPresented: $confirmSkip, titleVisibility: .visible) {
                    Button("Commit Without Hooks", role: .destructive, action: onSkipHooks)
                } message: {
                    Text("Commits with --no-verify: the \(failure.hook) hook and the others don't run.")
                }
        }
    }

    private var output: some View {
        VStack(alignment: .leading, spacing: 6) {
            ScrollView(showAll ? [.horizontal, .vertical] : .horizontal, showsIndicators: false) {
                Text(showAll ? failure.output : failure.preview.joined(separator: "\n"))
                    .font(.system(.caption, design: .monospaced))
                    .textSelection(.enabled)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .frame(maxHeight: showAll ? 320 : nil)
            if failure.lineCount > failure.preview.count {
                Button(showAll ? "Show Less" : "Show All \(failure.lineCount) Lines") { showAll.toggle() }
                    .font(.footnote)
                    .buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 2)
    }
}
