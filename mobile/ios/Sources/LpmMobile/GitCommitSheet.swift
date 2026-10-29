import SwiftUI

/// The commit sheet, the phone's take on the desktop's Commit dialog: the message,
/// which the Mac drafts from the diff as the sheet opens when there's none yet, a
/// Files row opening the list of changed files to include or leave out, the branch
/// and where it pushes, then Commit and Push or Commit only. The message and
/// selection belong to the review screen, so closing the sheet keeps the draft; a
/// commit that lands (with its push, if it pushes) closes it.
struct GitCommitSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    @Binding var message: String
    @Binding var deselected: Set<String>
    let drafted: String?
    @Binding var autoDraftTried: Bool
    // The commit landed while the sheet was up, so the alert it shows (a push that
    // failed after it) closes the sheet once read.
    @State private var committed = false

    private var snapshot: GitSnapshot? { model.git.snapshots[project] }
    private var files: [GitFile] { snapshot?.files ?? [] }
    private var selectedPaths: [String] { files.map(\.path).filter { !deselected.contains($0) } }
    private var committing: Bool { model.git.committing.contains(project) }
    private var pushing: Bool { model.git.pushing.contains(project) }
    private var generating: Bool { model.git.generatingMessage.contains(project) }
    private var trimmedMessage: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canCommit: Bool {
        !selectedPaths.isEmpty && !trimmedMessage.isEmpty && !committing && !pushing
    }

    private var busy: CommitButtons.Busy? {
        let pushes = model.git.commitPushing.contains(project)
        if committing { return pushes ? .committing : .committingOnly }
        return pushing && pushes ? .pushing : nil
    }

    private var branch: String? {
        guard let snapshot, !snapshot.detached, !snapshot.branch.isEmpty else { return nil }
        return snapshot.branch
    }

    var body: some View {
        NavigationStack {
            Form {
                if let notice = conflictNotice {
                    Section {
                        Label(notice, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
                Section {
                    TextField("Commit message", text: $message, axis: .vertical)
                        .lineLimit(3...8)
                    CommitDraftRow(
                        generating: generating,
                        drafted: drafted != nil && message == drafted,
                        canGenerate: !selectedPaths.isEmpty
                    ) {
                        model.git.genMessage(project, files: selectedPaths)
                    }
                }
                Section {
                    NavigationLink {
                        GitCommitFilesPage(project: project, deselected: $deselected)
                    } label: {
                        LabeledContent("Files") { filesSummary }
                    }
                    if let branch {
                        LabeledContent("Branch", value: "\(branch) → origin")
                    }
                }
            }
            .navigationTitle("Commit")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                CommitButtons(busy: busy, enabled: canCommit) {
                    let (message, files) = (trimmedMessage, selectedPaths)
                    AppLock.shared.confirm("Commit and push \(project)") {
                        model.git.commitAndPush(project, message: message, files: files)
                    }
                } commitOnly: {
                    model.git.commit(project, message: trimmedMessage, files: selectedPaths)
                }
            }
            .onChange(of: model.git.commitTick[project]) { _, _ in
                committed = true
                if model.git.opError[project] == nil { dismiss() }
            }
            // The review screen holds its own alert back while this sheet is up, so
            // a failed commit, push or message is reported here.
            .alert(
                model.git.opError[project]?.title ?? "",
                isPresented: Binding(get: { model.git.opError[project] != nil },
                                     set: { if !$0 { model.git.opError[project] = nil } })
            ) {
                Button("OK", role: .cancel) {
                    model.git.opError[project] = nil
                    if committed { dismiss() }
                }
            } message: {
                Text(model.git.opError[project]?.message ?? "")
            }
        }
        .onAppear(perform: autoDraft)
    }

    /// "4 of 4 · +52 −5": the files going in and the lines they change, once parsed.
    private var filesSummary: some View {
        var added = 0, removed = 0
        for path in selectedPaths {
            if let parsed = model.git.parsedDiff(project, path: path) {
                added += parsed.addedCount
                removed += parsed.removedCount
            }
        }
        return HStack(spacing: 6) {
            Text("\(selectedPaths.count) of \(files.count)")
            if added > 0 || removed > 0 {
                Text("·")
                DiffStat(added: added, removed: removed)
            }
        }
        .monospacedDigit()
    }

    /// The desktop's ConflictNotice: which files still have merge conflicts.
    private var conflictNotice: String? {
        let paths = files.filter { $0.status == "conflicted" }.map(\.path)
        if paths.isEmpty { return nil }
        let shown = 3
        let named = paths.count > shown
            ? paths.prefix(shown).joined(separator: ", ") + " and \(paths.count - shown) more"
            : paths.joined(separator: ", ")
        return "\(named) \(paths.count == 1 ? "has" : "have") merge conflicts. Resolve the conflict markers (<<<<<<< … >>>>>>>) before committing."
    }

    /// With no message yet, the Mac drafts one as the sheet opens. Once per draft:
    /// after a failed try the sheet waits for "Generate message".
    private func autoDraft() {
        guard !autoDraftTried, trimmedMessage.isEmpty, !selectedPaths.isEmpty, !generating else { return }
        autoDraftTried = true
        model.git.genMessage(project, files: selectedPaths)
    }
}
