import SwiftUI

/// Every check on the branch, with the desktop menu's ways on: fixing them with any
/// agent the project's New Tab sheet offers, in a new tab (once, or until CI is
/// green), running the failed jobs again, and the checks on GitHub.
struct GitChecksSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let project: Project
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    private var name: String { project.name }
    private var checks: GitChecks? { model.gitChecks.checks(name) }
    private var ahead: Int { model.git.snapshots[name]?.ahead ?? 0 }
    private var tabs: [LaunchpadTab]? { model.fixTabs(name, actions: project.actions) }

    @State private var gauntlet = ActionRunGauntlet()
    /// The fixing option whose inputs or confirmation are up, what it's told, and
    /// whether Keep fixing until green follows it.
    @State private var fixing: (option: LaunchpadOption, prompt: String, loops: Bool)?
    @State private var keepFixing = false
    /// The failed checks opened to their logs.
    @State private var openLogs: Set<String> = []

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
        .onAppear {
            if model.canLaunchAgents { model.agentLaunch.loadOptions() }
            model.gitExtras.forgetCheckLogs(name)
        }
        .onDisappear { model.gitChecks.forgetMerge(name) }
        .onChange(of: model.gitChecks.merged[name]) { _, merged in
            if merged != nil { Haptics.success() }
        }
        .actionRunGauntlet($gauntlet) { action, values in
            if let fixing { run(fixing.option, action, values, fixing.prompt, loops: fixing.loops) }
        }
    }

    private func list(_ checks: GitChecks) -> some View {
        List {
            if let merged = model.gitChecks.merged[name] {
                GitMergedSection(merged: merged)
            }
            GitMergeSection(project: name, checks: checks)
            if checks.conflicts, let prompt = checks.resolvePrompt, model.canLaunchAgents, checks.verdict != .fail {
                Section {
                    CiFixRows(tabs: tabs, verb: "Resolve with",
                              detail: "Opens a new tab to merge the base branch and resolve the conflicts") {
                        fix($0, prompt)
                    }
                }
            }
            Section {
                ForEach(checks.sorted) { check in
                    Button {
                        if check.hasLog && model.gitExtras.canReadCheckLogs {
                            withAnimation { toggleLog(check) }
                        } else if let url = URL(string: check.url) {
                            openURL(url)
                        }
                    } label: {
                        HStack(spacing: 10) {
                            CiStateIcon(state: check.state).frame(width: 18)
                            Text(check.name).lineLimit(1).foregroundStyle(.primary)
                            Spacer(minLength: 8)
                            Text(check.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            if check.hasLog && model.gitExtras.canReadCheckLogs {
                                Image(systemName: "chevron.down")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .rotationEffect(.degrees(openLogs.contains(check.id) ? 0 : -90))
                            }
                        }
                    }
                    .tint(.primary)
                    .disabled(check.url.isEmpty)
                    .accessibilityHint(check.hasLog && model.gitExtras.canReadCheckLogs ? "Shows why it failed" : "")
                    if openLogs.contains(check.id) {
                        CheckLogRow(project: name, check: check)
                    }
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

            let looping = model.gitChecks.loops[name]?.running == true
            if model.gitChecks.canKeepFixing, model.canLaunchAgents {
                CiFixLoopSection(project: name, canFix: checks.failed > 0 && checks.fixPrompt != nil,
                                 keepFixing: $keepFixing)
            }
            Section {
                if checks.failed > 0, let prompt = checks.fixPrompt, model.canLaunchAgents, !looping {
                    let loops = keepFixing && model.gitChecks.canKeepFixing
                    CiFixRows(tabs: tabs, detail: loops
                        ? "Opens a new tab with the failing checks, then sends each new failure until CI is green"
                        : "Opens a new tab with the failing checks") {
                        fix($0, loops ? checks.fixLoopPrompt ?? prompt : prompt, loops: loops)
                    }
                }
                if !checks.failingRunIds.isEmpty {
                    Button {
                        model.gitExtras.forgetCheckLogs(name)
                        openLogs = []
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
                        Label("Open checks on \(checks.pr?.site ?? "GitHub")", systemImage: "arrow.up.right.square")
                    }
                }
            } footer: {
                if let error = model.gitChecks.rerunErrors[name] {
                    Text(error).foregroundStyle(.red)
                }
            }
        }
    }

    private func toggleLog(_ check: CiCheck) {
        if openLogs.remove(check.id) == nil { openLogs.insert(check.id) }
    }

    private func fix(_ option: LaunchpadOption, _ prompt: String, loops: Bool = false) {
        fixing = (option, prompt, loops)
        if let action = option.action, gauntlet.begin(action) { return }
        run(option, option.action, [:], prompt, loops: loops)
    }

    /// Start the agent with the failing checks as its first prompt. A loop is
    /// armed first: the Mac follows the next tab the project opens.
    private func run(_ option: LaunchpadOption, _ action: Action?, _ values: [String: String], _ prompt: String,
                     loops: Bool) {
        let spawned = onSpawnedTerminal
        if loops { model.gitChecks.startLoop(name, agent: option.label) }
        dismiss()
        model.startFix(name, option: option, action: action, values: values, prompt: prompt) { spawned?($0) }
    }
}
