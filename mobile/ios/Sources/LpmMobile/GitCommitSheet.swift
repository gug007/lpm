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
    /// Opens the tab a Fix with … row starts.
    var onSpawnedTerminal: ((TerminalInfo) -> Void)? = nil
    @State private var gauntlet = ActionRunGauntlet()
    /// The Fix with … pick whose inputs or confirmation are up, and what it's told.
    @State private var fixing: (option: LaunchpadOption, prompt: String)?
    // The commit landed while the sheet was up, so the alert it shows (a push that
    // failed after it) closes the sheet once read.
    @State private var committed = false

    private var snapshot: GitSnapshot? { model.git.snapshots[project] }
    private var files: [GitFile] { snapshot?.files ?? [] }
    private var selectedPaths: [String] { files.map(\.path).filter { !deselected.contains($0) } }
    private var committing: Bool { model.git.committing.contains(project) }
    private var pushing: Bool { model.git.pushing.contains(project) }
    private var generating: Bool { model.git.generatingMessage.contains(project) }
    private var scanning: Bool { model.gitExtras.scanning.contains(project) }
    private var findings: [SecretFinding] { model.gitExtras.findings[project] ?? [] }
    private var hook: CommitHookFailure? { model.git.hookFailures[project] }
    private var fixTabs: [LaunchpadTab]? {
        model.fixTabs(project, actions: model.projects.first { $0.name == project }?.actions ?? [])
    }
    private var trimmedMessage: String { message.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canCommit: Bool {
        !selectedPaths.isEmpty && !trimmedMessage.isEmpty && !committing && !pushing && !scanning
    }

    private var busy: CommitButtons.Busy? {
        if scanning { return model.gitExtras.pendingPushes(project) ? .checking : .checkingOnly }
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
                if let hook {
                    CommitHookSection(failure: hook, tabs: fixTabs, busy: committing || pushing,
                                      onFix: { fix($0, hook) },
                                      onRetry: retryCommit,
                                      onSkipHooks: { model.git.commitWithoutHooks(project) },
                                      onDismiss: { model.git.dismissHookFailure(project) })
                }
                if !findings.isEmpty {
                    SecretFindingsSection(findings: findings) { path in
                        deselected.insert(path)
                        model.gitExtras.leaveOut(project, path: path)
                    } onIgnore: { finding in
                        model.gitExtras.ignore(project, finding)
                    } onDismiss: {
                        model.gitExtras.dismissFindings(project)
                    }
                }
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
                if hook != nil {
                    EmptyView()
                } else if findings.isEmpty {
                    CommitButtons(busy: busy, enabled: canCommit) {
                        let (message, files) = (trimmedMessage, selectedPaths)
                        AppLock.shared.confirm("Commit and push \(project)") {
                            model.gitExtras.commit(project, message: message, files: files, push: true)
                        }
                    } commitOnly: {
                        model.gitExtras.commit(project, message: trimmedMessage, files: selectedPaths, push: false)
                    }
                } else {
                    SecretFindingsButtons(flagged: model.gitExtras.flaggedFiles(project).count,
                                          remaining: model.gitExtras.cleanFiles(project).count,
                                          pushes: model.gitExtras.pendingPushes(project)) {
                        for path in model.gitExtras.flaggedFiles(project) { deselected.insert(path) }
                        model.gitExtras.leaveOutAndCommit(project)
                    } commitAnyway: {
                        model.gitExtras.commitAnyway(project)
                    }
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
        .actionRunGauntlet($gauntlet) { action, values in
            if let fixing { run(fixing.option, action, values, fixing.prompt) }
        }
        .onAppear(perform: autoDraft)
        .onDisappear {
            model.gitExtras.forgetSecrets(project)
            model.git.dismissHookFailure(project)
        }
        .task(id: hook != nil) {
            if hook != nil, model.canLaunchAgents, model.agentLaunch.options == nil { model.agentLaunch.loadOptions() }
        }
    }

    /// Try Again: the stopped commit as it was asked for, files a formatter
    /// rewrote going in with it.
    private func retryCommit() {
        guard let stopped = model.git.stoppedCommits[project] else { return }
        model.git.dismissHookFailure(project)
        model.gitExtras.commit(project, message: stopped.message, files: stopped.files, push: stopped.push)
    }

    private func fix(_ option: LaunchpadOption, _ failure: CommitHookFailure) {
        let stopped = model.git.stoppedCommits[project]
        let prompt = failure.prompt(message: stopped?.message ?? trimmedMessage, files: stopped?.files ?? selectedPaths)
        fixing = (option, prompt)
        if let action = option.action, gauntlet.begin(action) { return }
        run(option, option.action, [:], prompt)
    }

    /// Starts the agent with what the hook printed as its first prompt, in a new
    /// tab the review screen opens.
    private func run(_ option: LaunchpadOption, _ action: Action?, _ values: [String: String], _ prompt: String) {
        let spawned = onSpawnedTerminal
        model.git.dismissHookFailure(project)
        dismiss()
        model.startFix(project, option: option, action: action, values: values, prompt: prompt) { spawned?($0) }
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
