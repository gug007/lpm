import SwiftUI

/// Hosts the project "more" menu on any screen: the toolbar button plus every
/// presentation its items drive (review push, git sheets, discard dialog,
/// action run flow, background-run sheet).
struct ProjectMenuHost: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: Project
    // The terminal whose screen hosts the menu, if any.
    let terminal: TerminalInfo?
    // Run a terminal action and switch to the terminal it spawns.
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    @State private var showChanges = false
    @State private var showFiles = false
    @State private var showResume = false
    @State private var showMemory = false
    @State private var showNotes = false
    @State private var showAutomations = false
    @State private var showBranchSheet = false
    @State private var showPrSheet = false
    @State private var showAutoSheet = false
    @State private var confirmingDiscard = false
    @State private var showTerminalSettings = false
    @State private var showingConfig = false
    @State private var showActions = false
    // Action run flow: collect inputs (if any) → confirm (if flagged) → dispatch.
    @State private var gauntlet = ActionRunGauntlet()
    @State private var activeBgRun: BackgroundRunInfo?
    @State private var isVisible = false
    // Rename flow: the text field's draft, seeded from the current label.
    @State private var renaming = false
    @State private var renameText = ""
    @State private var renamingTab: TabRename?
    @State private var noteFor: WorkStatusChoice?
    @State private var claudeConsent: ClaudeConsentRequest?

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
            .navigationDestination(isPresented: $showFiles) { ProjectFilesScreen(project: project) }
            .navigationDestination(isPresented: $showMemory) { MemoryScreen(project: project) }
            .navigationDestination(isPresented: $showNotes) { NotesScreen(project: project.name) }
            .navigationDestination(isPresented: $showAutomations) { AutomationsView(project: project.name) }
            .sheet(isPresented: $showBranchSheet) {
                GitBranchSheet(project: project).environment(model)
            }
            .sheet(isPresented: $showPrSheet) {
                GitPrSheet(project: project).environment(model)
            }
            .sheet(isPresented: $showAutoSheet) {
                GitAutoSheet(project: project).environment(model)
            }
            .sheet(isPresented: $showResume) {
                ResumeSessionSheet(project: project, onOpen: { onSpawnedTerminal?($0) }).environment(model)
            }
            .confirmationDialog(
                "Discard all changes?",
                isPresented: $confirmingDiscard,
                titleVisibility: .visible
            ) {
                Button("Discard changes", role: .destructive) {
                    Haptics.warning()
                    AppLock.shared.confirm("Discard every change in \(project.name)") { model.git.discardAll(project.name) }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This permanently discards every uncommitted change in this project. This can't be undone.")
            }
            // Gated on isVisible because several screens in one navigation stack
            // host this modifier — without it a single gitOpError would try to
            // present an alert on every one at once. The review screen owns its
            // own copy of this alert, hence the !showChanges gate too.
            .alert(
                model.git.opError[project.name]?.title ?? "",
                isPresented: Binding(
                    get: { isVisible && !showChanges && !showAutoSheet && model.git.opError[project.name] != nil },
                    set: { if !$0 { model.git.opError[project.name] = nil } }
                )
            ) {
                Button("OK", role: .cancel) { model.git.opError[project.name] = nil }
            } message: {
                Text(model.git.opError[project.name]?.message ?? "")
            }
            .gitNotice(project: project.name, isActive: isVisible && !showChanges)
            .actionRunGauntlet($gauntlet) { action, values in
                dispatch(action, inputValues: values, deferred: true)
            }
            .sheet(item: $activeBgRun) { run in
                BackgroundRunSheet(run: run).environment(model)
            }
            .sheet(isPresented: $showTerminalSettings) { TerminalSettingsSheet() }
            .sheet(isPresented: $showingConfig) {
                ProjectConfigView(project: project).environment(model)
            }
            .projectActionsSheet(project: project, isPresented: $showActions, onRun: beginRun)
            .tabRenameAlert($renamingTab)
            .alert("Rename project", isPresented: $renaming) {
                TextField("Project name", text: $renameText)
                Button("Cancel", role: .cancel) {}
                Button("Save") { model.renameProject(project, name: renameText) }
            } message: {
                Text("Set a display name for this project. Leave it blank to use the project id.")
            }
            .workStatusNotePrompt(project: project, noteFor: $noteFor)
            .claudeConsentPrompt($claudeConsent)
            .toolbar {
                if !project.actions.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button { showActions = true } label: {
                            Label("Actions", systemImage: "bolt")
                        }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ProjectRunControl(project: project,
                                      pending: pending,
                                      changedCount: changedCount,
                                      onStart: { model.startProject(project, profile: $0) },
                                      onStop: { model.confirmStop(project) },
                                      onReviewChanges: { showChanges = true },
                                      onFiles: model.canBrowseFiles(project) ? { showFiles = true } : nil,
                                      onResumeSession: model.canResumeSessions(project) ? { showResume = true } : nil,
                                      onMemory: { showMemory = true },
                                      onNotes: { showNotes = true },
                                      onAutomations: { showAutomations = true },
                                      onSwitchBranch: { showBranchSheet = true },
                                      onCreatePr: { showPrSheet = true },
                                      onAuto: { kind in
                                          model.gitAuto.start(project.name, kind: kind)
                                          showAutoSheet = true
                                      },
                                      onDiscard: { confirmingDiscard = true },
                                      renamesTab: terminal != nil,
                                      onRename: rename,
                                      onTerminalSettings: { showTerminalSettings = true },
                                      onConfigure: { showingConfig = true },
                                      noteFor: $noteFor,
                                      claudeConsent: $claudeConsent)
                        .environment(model)
                }
            }
            .onAppear {
                isVisible = true
                model.git.load(project.name)
                if !project.isRemote { model.loadClaudeAccounts() }
            }
            .onDisappear { isVisible = false }
    }

    private func rename() {
        if let terminal {
            renamingTab = TabRename(terminal)
        } else {
            renameText = project.label
            renaming = true
        }
    }

    // Action run flow — mirrors the desktop gauntlet (inputs → confirm → dispatch).
    // Non-terminal actions run headlessly on the Mac with logs streamed back;
    // terminal/command actions relay to the Mac's terminal flow (confirmed:true so
    // the Mac doesn't re-prompt).
    private func beginRun(_ action: Action) {
        if !gauntlet.begin(action) { dispatch(action, inputValues: [:], deferred: false) }
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
    func projectMenuToolbar(project: Project, terminal: TerminalInfo? = nil,
                            onSpawnedTerminal: ((TerminalInfo) -> Void)? = nil) -> some View {
        modifier(ProjectMenuHost(project: project, terminal: terminal, onSpawnedTerminal: onSpawnedTerminal))
    }
}
