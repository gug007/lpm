import SwiftUI

/// Every check on the branch, with the desktop menu's ways on: fixing them with any
/// agent the project's New Tab sheet offers, in a new tab, running the failed jobs
/// again, and the checks on GitHub.
struct GitChecksSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let project: Project
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    private var name: String { project.name }
    private var checks: GitChecks? { model.gitChecks.checks(name) }
    private var ahead: Int { model.git.snapshots[name]?.ahead ?? 0 }
    private var tabs: [LaunchpadTab]? {
        model.agentLaunch.options.map {
            launchpadTabs(model.canPromptActions ? project.actions : [], project: name, agents: $0,
                          skipOwnTasks: true)
        }
    }

    @State private var gauntlet = ActionRunGauntlet()
    /// The fixing option whose inputs or confirmation are up.
    @State private var fixing: LaunchpadOption?

    var body: some View {
        NavigationStack {
            Group {
                if let checks {
                    list(checks)
                } else if let merged = model.gitChecks.merged[name] {
                    List { GitMergedSection(merged: merged) }
                } else {
                    ContentUnavailableView("No checks", systemImage: "checkmark.circle",
                                           description: Text("GitHub has no checks for this branch."))
                }
            }
            .navigationTitle("CI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.fontWeight(.semibold) }
            }
        }
        .onAppear { if model.canLaunchAgents { model.agentLaunch.loadOptions() } }
        .onDisappear { model.gitChecks.forgetMerge(name) }
        .onChange(of: model.gitChecks.merged[name]) { _, merged in
            if merged != nil { Haptics.success() }
        }
        .actionRunGauntlet($gauntlet) { action, values in
            if let fixing, let prompt = checks?.fixPrompt { run(fixing, action, values, prompt) }
        }
    }

    private func list(_ checks: GitChecks) -> some View {
        List {
            if let merged = model.gitChecks.merged[name] {
                GitMergedSection(merged: merged)
            }
            GitMergeSection(project: name, checks: checks)
            Section {
                ForEach(checks.sorted) { check in
                    Button {
                        if let url = URL(string: check.url) { openURL(url) }
                    } label: {
                        HStack(spacing: 10) {
                            CiStateIcon(state: check.state).frame(width: 18)
                            Text(check.name).lineLimit(1).foregroundStyle(.primary)
                            Spacer(minLength: 8)
                            Text(check.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    .tint(.primary)
                    .disabled(check.url.isEmpty)
                }
            } header: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(checks.heading)
                    if let sub = checks.subheading, !sub.isEmpty {
                        Text(sub).textCase(nil).lineLimit(1)
                    }
                }
            } footer: {
                if let note = checks.unpushedNote(ahead: ahead) { Text(note) }
            }

            Section {
                if checks.failed > 0, let prompt = checks.fixPrompt, model.canLaunchAgents {
                    if let tabs {
                        CiFixRows(tabs: tabs) { fix($0, prompt) }
                    } else {
                        TerminalRowSkeleton()
                    }
                }
                if !checks.failingRunIds.isEmpty {
                    Button {
                        model.gitChecks.rerun(name)
                    } label: {
                        HStack {
                            Label("Re-run failed jobs", systemImage: "arrow.counterclockwise")
                            if model.gitChecks.rerunning.contains(name) {
                                Spacer()
                                ProgressView().controlSize(.small)
                            }
                        }
                    }
                    .disabled(model.gitChecks.rerunning.contains(name))
                }
                if let url = checks.githubURL {
                    Button {
                        openURL(url)
                    } label: {
                        Label("Open checks on GitHub", systemImage: "arrow.up.right.square")
                    }
                }
            } footer: {
                if let error = model.gitChecks.rerunErrors[name] {
                    Text(error).foregroundStyle(.red)
                }
            }
        }
    }

    private func fix(_ option: LaunchpadOption, _ prompt: String) {
        fixing = option
        if let action = option.action, gauntlet.begin(action) { return }
        run(option, option.action, [:], prompt)
    }

    /// Start the agent with the failing checks as its first prompt.
    private func run(_ option: LaunchpadOption, _ action: Action?, _ values: [String: String], _ prompt: String) {
        let spawned = onSpawnedTerminal
        dismiss()
        model.startFix(name, option: option, action: action, values: values, prompt: prompt) { spawned?($0) }
    }
}
