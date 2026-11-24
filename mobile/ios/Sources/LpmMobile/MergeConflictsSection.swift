import SwiftUI

/// The desktop Merge dialog's conflicts panel, above the changes while a merge, a
/// pull or a rebase left conflicts: each file and how many it has left, AI to work
/// through them, and the merge to commit or undo.
struct MergeConflictsSection: View {
    @Environment(AppModel.self) private var model
    let project: String
    let merge: GitMergeState
    let branch: String
    @State private var confirmingAbort = false
    @State private var preview: FilePreviewTarget?

    private var op: GitConflictOp? { model.git.conflictOps[project] }
    private var line: String? { model.git.resolvingConflicts[project] }
    private var locked: Bool { op != nil || line != nil || model.macAway }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            VStack(alignment: .leading, spacing: 2) {
                ForEach(merge.files) { file in
                    MergeConflictRow(
                        file: file,
                        side: model.git.conflictSides[project]?[file.path],
                        busy: op?.path == file.path,
                        locked: locked,
                        onOpen: {
                            preview = FilePreviewTarget(project: project, paths: [file.path], line: file.firstLine)
                        },
                        onAction: { model.git.runConflictOp(project, $0) }
                    )
                }
            }
            actions
            // Last, so nothing takes Stop's place under the finger.
            if let line { progressLine(line) }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.top, 12)
        .padding(.bottom, 4)
        .sheet(item: $preview) { FilePreviewSheet(target: $0).environment(model) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(merge.title(into: branch))
                .font(.subheadline.weight(.semibold))
                .fixedSize(horizontal: false, vertical: true)
            Text(merge.progress)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .monospacedDigit()
            ReviewProgressBar(done: merge.files.count - merge.remaining, total: merge.files.count)
        }
        .accessibilityElement(children: .combine)
    }

    private func progressLine(_ line: String) -> some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text(line.isEmpty ? "Starting…" : line)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Spacer(minLength: 8)
            Button("Stop") { model.git.runConflictOp(project, .stop) }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .disabled(op != nil || model.macAway)
        }
    }

    @ViewBuilder
    private var actions: some View {
        if merge.remaining > 0 || line != nil {
            actionButton(line == nil ? "Resolve \(merge.remaining) with AI" : "Resolving…", busy: op == .resolve) {
                Haptics.tap()
                model.git.runConflictOp(project, .resolve)
            }
            .buttonStyle(.borderedProminent)
            .disabled(locked)
        }
        if merge.merging {
            HStack(spacing: 10) {
                actionButton("Abort merge", busy: op == .abort) { confirmingAbort = true }
                    .buttonStyle(.bordered)
                    .tint(.red)
                    .disabled(locked)
                    .confirmationDialog("Abort the merge?", isPresented: $confirmingAbort, titleVisibility: .visible) {
                        Button("Abort Merge", role: .destructive) {
                            Haptics.warning()
                            AppLock.shared.confirm("Abort the merge in \(project)") {
                                model.git.runConflictOp(project, .abort)
                            }
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("The branch goes back to how it was before the merge, and what was resolved so far is lost.")
                    }
                actionButton("Continue merge", busy: committing) {
                    Haptics.tap()
                    model.git.runConflictOp(project, .commit(merge.source))
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
                .disabled(locked || merge.remaining > 0)
            }
        }
    }

    private var committing: Bool {
        if case .commit = op { return true }
        return false
    }

    private func actionButton(_ title: String, busy: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                Text(title).fontWeight(.semibold).opacity(busy ? 0 : 1)
                if busy { ProgressView() }
            }
            .font(.subheadline)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .frame(maxWidth: .infinity, minHeight: 24)
        }
    }
}

/// One conflicted file: how it stands, opening at its first conflict, with the
/// desktop row's actions in its menu.
private struct MergeConflictRow: View {
    let file: GitConflictFile
    let side: GitConflictSide?
    let busy: Bool
    let locked: Bool
    let onOpen: () -> Void
    let onAction: (GitConflictOp) -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onOpen) { label }
                .buttonStyle(.plain)
            if busy {
                ProgressView().controlSize(.small).frame(width: 32, height: 32)
            } else if !file.resolved {
                menu
            }
        }
        .frame(minHeight: 36)
    }

    private var label: some View {
        HStack(spacing: 8) {
            Image(systemName: file.resolved ? "checkmark.circle" : "exclamationmark.circle")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(file.resolved ? .green : .red)
            VStack(alignment: .leading, spacing: 1) {
                Text(file.path)
                    .font(.system(.footnote, design: .monospaced))
                    .foregroundStyle(file.resolved ? .secondary : .primary)
                    .lineLimit(1)
                    .truncationMode(.head)
                Text(file.label(side: side))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(file.path), \(file.label(side: side))")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens the file")
    }

    private var menu: some View {
        Menu {
            if file.conflicts == 0 {
                Button("Mark resolved") { onAction(.markResolved(path: file.path)) }
            }
            Button("Use ours") { onAction(.take(path: file.path, side: .ours)) }
            Button("Use theirs") { onAction(.take(path: file.path, side: .theirs)) }
        } label: {
            Image(systemName: "ellipsis")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .disabled(locked)
        .accessibilityLabel("Actions for \((file.path as NSString).lastPathComponent)")
    }
}
