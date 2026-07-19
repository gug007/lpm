import SwiftUI
import UIKit

/// The project's control menu in the nav bar: a single "more" button whose native
/// menu holds Start/Stop, the run-actions submenu, and (when present) profiles.
/// Per-service display and toggles live in the list's Services section.
struct ProjectRunControl: View {
    @Environment(AppModel.self) private var model
    let project: Project
    let pending: Bool
    let actions: [Action]
    let changedCount: Int?
    let onStart: (_ profile: String) -> Void
    let onStop: () -> Void
    let onRunAction: (_ action: Action) -> Void
    let onReviewChanges: () -> Void
    let onSwitchBranch: () -> Void
    let onCreatePr: () -> Void
    let onDiscard: () -> Void
    let onRename: () -> Void
    let onTerminalSettings: () -> Void

    private var running: Bool { project.running }

    private var name: String { project.name }
    private var pulling: Bool { model.git.pulling.contains(name) }
    private var pushing: Bool { model.git.pushing.contains(name) }
    private var fetching: Bool { model.git.fetching.contains(name) }
    private var branch: String { model.git.snapshots[name]?.branch ?? "" }
    private var ghCli: Bool { model.git.snapshots[name]?.ghCli ?? false }

    var body: some View {
        Menu {
            Button {
                running ? onStop() : onStart(project.activeProfile)
            } label: {
                Label(running ? "Stop" : "Start",
                      systemImage: running ? "stop.fill" : "play.fill")
            }

            Button(action: onReviewChanges) {
                Label("Review Changes", systemImage: "checklist")
                if let changedCount, changedCount > 0 {
                    Text("\(changedCount) changed file\(changedCount == 1 ? "" : "s")")
                }
            }

            gitMenu

            if !actions.isEmpty {
                Menu {
                    ForEach(actions) { a in
                        Button { onRunAction(a) } label: { actionLabel(a) }
                    }
                } label: {
                    Label("Actions", systemImage: "bolt")
                }
            }

            if !project.profiles.isEmpty {
                Section("Profiles") {
                    ForEach(project.profiles) { p in
                        Button { onStart(p.name) } label: { profileLabel(p) }
                    }
                }
            }

            Divider()
            Button(action: onRename) {
                Label("Rename…", systemImage: "pencil")
            }
            Button(action: onTerminalSettings) {
                Label("Terminal Settings", systemImage: "textformat.size")
            }
        } label: {
            if pending {
                ProgressView()
                    .controlSize(.small)
            } else {
                Image(systemName: "ellipsis")
                    .foregroundStyle(running ? .green : .primary)
            }
        }
    }

    /// The desktop's project Git submenu, adapted to mobile: sync ops that fire
    /// directly (disabled while in flight), then branch/PR navigation, then
    /// copy-branch and the destructive discard. Review Changes sits on the main
    /// menu, one level up.
    private var gitMenu: some View {
        Menu {
            Button { model.git.pull(name) } label: { Label("Pull", systemImage: "arrow.down") }
                .disabled(pulling)
            Button { model.git.push(name) } label: { Label("Push", systemImage: "arrow.up") }
                .disabled(pushing)
            Button { model.git.fetch(name) } label: { Label("Fetch", systemImage: "arrow.triangle.2.circlepath") }
                .disabled(fetching)

            Divider()

            Button(action: onSwitchBranch) {
                Label("Switch Branch…", systemImage: "arrow.trianglehead.branch")
            }
            if ghCli {
                Button(action: onCreatePr) {
                    Label("Create Pull Request…", systemImage: "arrow.triangle.pull")
                }
            }

            Divider()

            Button { UIPasteboard.general.string = branch } label: {
                Label("Copy Branch Name", systemImage: "doc.on.doc")
            }
            .disabled(branch.isEmpty)
            Button(role: .destructive, action: onDiscard) {
                Label("Discard All Changes…", systemImage: "trash")
            }
            .disabled((changedCount ?? 0) == 0)
        } label: {
            Label("Git", systemImage: "arrow.trianglehead.branch")
        }
    }

    @ViewBuilder
    private func actionLabel(_ a: Action) -> some View {
        if a.emoji.isEmpty {
            Text(a.label)
        } else {
            Text("\(a.emoji)  \(a.label)")
        }
    }

    @ViewBuilder
    private func profileLabel(_ p: Profile) -> some View {
        if running && project.activeProfile == p.name {
            Label(p.name, systemImage: "checkmark")
        } else {
            Text(p.name)
        }
    }

}

/// Hosts the project "more" menu on any screen: the toolbar button plus every
/// presentation its items drive (review push, git sheets, discard dialog,
/// action run flow, background-run sheet).
struct ProjectMenuHost: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: Project
    // Set only by TerminalScreen: run a terminal action and switch to the terminal
    // it spawns. nil on other screens (ProjectDetail keeps its skeleton-row flow).
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    @State private var showChanges = false
    @State private var showBranchSheet = false
    @State private var showPrSheet = false
    @State private var confirmingDiscard = false
    @State private var showTerminalSettings = false
    // Action run flow: collect inputs (if any) → confirm (if flagged) → dispatch.
    @State private var runInputsFor: Action?
    @State private var runConfirmFor: Action?
    @State private var pendingInputValues: [String: String] = [:]
    @State private var activeBgRun: BackgroundRunInfo?
    @State private var isVisible = false
    // Rename flow: the text field's draft, seeded from the current label.
    @State private var renaming = false
    @State private var renameText = ""

    private var actions: [Action] { project.actions.flatMap { $0.runnableLeaves } }
    // Changed-file count for the Review Changes menu item; nil until the snapshot
    // loads (or when the project isn't a git repo).
    private var changedCount: Int? {
        guard let s = model.git.snapshots[project.name], s.isRepo else { return nil }
        return s.files.count
    }
    private var pending: Bool { model.pendingRun[project.name] != nil }

    func body(content: Content) -> some View {
        content
            .navigationDestination(isPresented: $showChanges) { GitReviewView(project: project) }
            .sheet(isPresented: $showBranchSheet) {
                GitBranchSheet(project: project).environment(model)
            }
            .sheet(isPresented: $showPrSheet) {
                GitPrSheet(project: project).environment(model)
            }
            .confirmationDialog(
                "Discard all changes?",
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button("Discard changes", role: .destructive) { Haptics.warning(); model.git.discardAll(project.name) }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently discards every uncommitted change in this project. This can't be undone.")
            }
            // Gated on isVisible because several screens in one navigation stack
            // host this modifier — without it a single gitOpError would try to
            // present an alert on every one at once. The review screen owns its
            // own copy of this alert, hence the !showChanges gate too.
            .alert(
                "Something went wrong",
                isPresented: Binding(
                    get: { isVisible && !showChanges && model.git.opError[project.name] != nil },
                    set: { if !$0 { model.git.opError[project.name] = nil } }
                )
            ) {
                Button("OK", role: .cancel) { model.git.opError[project.name] = nil }
            } message: {
                Text(model.git.opError[project.name] ?? "")
            }
            .sheet(item: $runInputsFor) { action in
                ActionInputsSheet(action: action) { values in afterInputs(action, values) }
            }
            .alert(
                runConfirmFor.map { "Run \($0.label)?" } ?? "Run action?",
                isPresented: Binding(
                    get: { runConfirmFor != nil },
                    set: { if !$0 { runConfirmFor = nil; pendingInputValues = [:] } }
                ),
                presenting: runConfirmFor
            ) { action in
                Button("Run") { runConfirmed(action) }
                Button("Cancel", role: .cancel) {}
            }
            .sheet(item: $activeBgRun) { run in
                BackgroundRunSheet(run: run).environment(model)
            }
            .sheet(isPresented: $showTerminalSettings) { TerminalSettingsSheet() }
            .alert("Rename project", isPresented: $renaming) {
                TextField("Project name", text: $renameText)
                Button("Cancel", role: .cancel) {}
                Button("Save") { model.renameProject(project, name: renameText) }
            } message: {
                Text("Set a display name for this project. Leave it blank to use the project id.")
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    ProjectRunControl(project: project,
                                      pending: pending,
                                      actions: actions,
                                      changedCount: changedCount,
                                      onStart: { model.startProject(project, profile: $0) },
                                      onStop: { model.stopProject(project) },
                                      onRunAction: { beginRun($0) },
                                      onReviewChanges: { showChanges = true },
                                      onSwitchBranch: { showBranchSheet = true },
                                      onCreatePr: { showPrSheet = true },
                                      onDiscard: { confirmingDiscard = true },
                                      onRename: { renameText = project.label; renaming = true },
                                      onTerminalSettings: { showTerminalSettings = true })
                        .environment(model)
                }
            }
            .onAppear {
                isVisible = true
                model.git.load(project.name)
            }
            .onDisappear { isVisible = false }
    }

    // Action run flow — mirrors the desktop gauntlet (inputs → confirm → dispatch).
    // Non-terminal actions run headlessly on the Mac with logs streamed back;
    // terminal/command actions relay to the Mac's terminal flow (confirmed:true so
    // the Mac doesn't re-prompt).
    private func beginRun(_ action: Action) {
        if !action.inputs.isEmpty { runInputsFor = action; return }
        if action.confirm { runConfirmFor = action; return }
        dispatch(action, inputValues: [:], deferred: false)
    }
    private func afterInputs(_ action: Action, _ values: [String: String]) {
        if action.confirm {
            pendingInputValues = values
            // The inputs sheet is dismissing in this same update; presenting the
            // alert now can be swallowed (one presentation at a time), so let the
            // sheet settle first — same guard as dispatch(deferred:).
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { runConfirmFor = action }
            return
        }
        dispatch(action, inputValues: values, deferred: true)
    }
    private func runConfirmed(_ action: Action) {
        let values = pendingInputValues
        pendingInputValues = [:]
        dispatch(action, inputValues: values, deferred: true)
    }
    private func dispatch(_ action: Action, inputValues: [String: String], deferred: Bool) {
        if action.runsInBackground {
            let runId = model.startBackgroundAction(project: project.name, action: action.name,
                                                    label: action.label, inputValues: inputValues)
            let present = { activeBgRun = model.backgroundRunInfo[runId] }
            // A run reached from a dismissing sheet/alert waits for it to settle
            // before this sheet is presented (SwiftUI can't stack two at once).
            if deferred { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: present) }
            else { present() }
        } else {
            model.runAction(project.name, action: action.name, inputValues: inputValues,
                            confirmed: true, onSpawn: onSpawnedTerminal)
        }
    }
}

extension View {
    func projectMenuToolbar(project: Project,
                            onSpawnedTerminal: ((TerminalInfo) -> Void)? = nil) -> some View {
        modifier(ProjectMenuHost(project: project, onSpawnedTerminal: onSpawnedTerminal))
    }
}
