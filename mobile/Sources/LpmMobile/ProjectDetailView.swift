import SwiftUI
import UIKit

/// A project's screen: the project's open terminals, services, and background
/// runs as a native list, with a nav-bar "+" for new terminals and a "more" menu
/// for Start/Stop and actions. Terminal tab actions (Pin / Rename / Close) live
/// on native swipe gestures.
struct ProjectDetail: View {
    @EnvironmentObject var model: AppModel
    let project: Project
    @State private var renaming: TerminalInfo?
    @State private var renameText = ""
    @State private var openTerminal: TerminalInfo?
    @State private var showChanges = false
    @State private var showBranchSheet = false
    @State private var showPrSheet = false
    @State private var confirmingDiscard = false
    // Action run flow: collect inputs (if any) → confirm (if flagged) → dispatch.
    @State private var runInputsFor: Action?
    @State private var runConfirmFor: Action?
    @State private var pendingInputValues: [String: String] = [:]
    @State private var activeBgRun: BackgroundRunInfo?
    @State private var logsForService: Service?

    // Current project object (fresh status/actions) from the store; falls back to
    // the one we were pushed with.
    private var live: Project { model.projects.first(where: { $0.name == project.name }) ?? project }
    private var terminals: [TerminalInfo] { model.terminals[project.name] ?? [] }
    // nil vs [] tells "still loading" apart from "no terminals".
    private var terminalsLoaded: Bool { model.terminals[project.name] != nil }
    private var creating: Bool { model.creatingTerminals.contains(project.name) }
    private var actions: [Action] { live.actions.flatMap { $0.runnableLeaves } }
    private var bgRuns: [BackgroundRunInfo] { model.backgroundRunList(for: project.name) }
    // `services` is the resolved running list; display gates on `running`.
    private var runningServices: Set<String> {
        live.running ? Set(live.services.map(\.name)) : []
    }
    // Changed-file count for the Review Changes menu item; nil until the snapshot
    // loads (or when the project isn't a git repo).
    private var changedCount: Int? {
        guard let s = model.gitSnapshots[project.name], s.isRepo else { return nil }
        return s.files.count
    }

    var body: some View {
        // A plain List (not insetGrouped) so each terminal renders as its own
        // spaced card while keeping native drag-to-reorder via `.onMove`.
        List {
            if !terminalsLoaded {
                Section {
                    ForEach(0..<3, id: \.self) { _ in
                        TerminalRowSkeleton()
                            .terminalRowChrome()
                    }
                } header: {
                    TabsSectionHeader(count: 0)
                }
            } else if !terminals.isEmpty || creating {
                Section {
                    ForEach(terminals) { t in
                        TerminalRow(term: t, onOpen: { openTerminal = t })
                        .terminalRowChrome()
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                model.pinTerminal(project.name, id: t.id)
                            } label: {
                                Label(t.pinned ? "Unpin" : "Pin",
                                      systemImage: t.pinned ? "pin.slash" : "pin")
                            }
                            .tint(.orange)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                model.closeTerminal(project.name, id: t.id)
                            } label: {
                                Label("Close", systemImage: "xmark")
                            }
                            Button {
                                renameText = t.label
                                renaming = t
                            } label: {
                                Label("Rename", systemImage: "pencil")
                            }
                            .tint(.gray)
                        }
                    }
                    .onMove(perform: moveTerminals)
                    if creating {
                        TerminalRowSkeleton()
                            .terminalRowChrome()
                    }
                } header: {
                    TabsSectionHeader(count: terminals.count)
                }
            }

            if !live.allServices.isEmpty {
                Section {
                    ForEach(live.allServices) { s in
                        ServiceRow(service: s,
                                   running: runningServices.contains(s.name),
                                   pending: model.pendingServiceToggle[project.name]?[s.name] != nil,
                                   onToggle: { model.toggleService(live.name, service: s.name) })
                            .terminalRowChrome()
                            .contentShape(Rectangle())
                            .onTapGesture { logsForService = s }
                    }
                } header: {
                    Text("Services")
                }
            }

            if !bgRuns.isEmpty {
                Section {
                    ForEach(bgRuns) { run in
                        BackgroundRunRow(run: run, snapshot: model.backgroundRuns[run.runId],
                                         startError: model.backgroundRunErrors[run.runId])
                            .terminalRowChrome()
                            .contentShape(Rectangle())
                            .onTapGesture { activeBgRun = run }
                    }
                } header: {
                    Text("Background runs")
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(.systemGroupedBackground))
        // Full-space overlay (not a list row): ContentUnavailableView is greedy
        // and inside a row it stretches the row — and its action button — to
        // fill the expanse.
        .overlay {
            if terminalsLoaded && terminals.isEmpty && !creating
                && live.allServices.isEmpty && bgRuns.isEmpty {
                EmptyTerminalsView(onNew: { model.newTerminal(project.name) })
            }
        }
        .animation(.default, value: terminalsLoaded)
        .animation(.default, value: creating)
        .refreshable {
            model.loadTerminals(project.name)
        }
        .navigationTitle(project.label)
        .navigationBarTitleDisplayMode(.inline)
        .navigationSubtitleCompat(live.running ? "Running" : "Stopped")
        .navigationDestination(item: $openTerminal) { TerminalScreen(term: $0) }
        .navigationDestination(isPresented: $showChanges) { GitReviewView(project: live) }
        .sheet(isPresented: $showBranchSheet) {
            GitBranchSheet(project: live).environmentObject(model)
        }
        .sheet(isPresented: $showPrSheet) {
            GitPrSheet(project: live).environmentObject(model)
        }
        .confirmationDialog(
            "Discard all changes?",
            isPresented: $confirmingDiscard,
            titleVisibility: .visible
        ) {
            Button("Discard changes", role: .destructive) { model.gitDiscardAll(live.name) }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently discards every uncommitted change in this project. This can't be undone.")
        }
        // Presented only while the review screen (which owns its own copy of this
        // alert) is closed, so a single gitOpError can't fire two alerts at once.
        .alert(
            "Something went wrong",
            isPresented: Binding(
                get: { !showChanges && model.gitOpError[live.name] != nil },
                set: { if !$0 { model.gitOpError[live.name] = nil } }
            )
        ) {
            Button("OK", role: .cancel) { model.gitOpError[live.name] = nil }
        } message: {
            Text(model.gitOpError[live.name] ?? "")
        }
        .alert("Rename terminal", isPresented: Binding(
            get: { renaming != nil },
            set: { if !$0 { renaming = nil } }
        )) {
            TextField("Name", text: $renameText)
            Button("Cancel", role: .cancel) { renaming = nil }
            Button("Rename") {
                let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
                if let t = renaming, !name.isEmpty {
                    model.renameTerminal(project.name, id: t.id, label: name)
                }
                renaming = nil
            }
        }
        .sheet(item: $runInputsFor) { action in
            ActionInputsSheet(action: action) { values in afterInputs(action, values) }
        }
        .sheet(item: $activeBgRun) { run in
            BackgroundRunSheet(run: run).environmentObject(model)
        }
        .sheet(item: $logsForService) { s in
            ServiceLogsSheet(project: live.name, service: s).environmentObject(model)
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
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                ProjectRunControl(project: live,
                                  pending: model.pendingRun[live.name] != nil,
                                  actions: actions,
                                  changedCount: changedCount,
                                  onStart: { profile in model.startProject(live, profile: profile) },
                                  onStop: { model.stopProject(live) },
                                  onRunAction: { beginRun($0) },
                                  onReviewChanges: { showChanges = true },
                                  onSwitchBranch: { showBranchSheet = true },
                                  onCreatePr: { showPrSheet = true },
                                  onDiscard: { confirmingDiscard = true })
                    .environmentObject(model)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    model.newTerminal(project.name)
                } label: {
                    Label("New Terminal", systemImage: "plus")
                }
                .disabled(creating)
            }
        }
        .onAppear {
            model.loadTerminals(project.name)
            model.loadGit(project.name)
            model.loadBackgroundRuns(project.name)
        }
        // Keep the background-runs section fresh while it's on screen: poll any run
        // still marked running (or not yet polled) every 3s.
        .task {
            while !Task.isCancelled {
                for run in model.backgroundRunList(for: project.name)
                where model.backgroundRuns[run.runId]?.running ?? true {
                    model.loadBackgroundRunOutput(project: project.name, runId: run.runId)
                }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
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
            let runId = model.startBackgroundAction(project: live.name, action: action.name,
                                                    label: action.label, inputValues: inputValues)
            let present = { activeBgRun = model.backgroundRunInfo[runId] }
            // A run reached from a dismissing sheet/alert waits for it to settle
            // before this sheet is presented (SwiftUI can't stack two at once).
            if deferred { DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: present) }
            else { present() }
        } else {
            model.runAction(live.name, action: action.name, inputValues: inputValues, confirmed: true)
        }
    }

    private func moveTerminals(from source: IndexSet, to destination: Int) {
        var order = terminals.map(\.id)
        order.move(fromOffsets: source, toOffset: destination)
        model.reorderTerminals(project.name, order: order)
    }
}

private extension View {
    @ViewBuilder
    func navigationSubtitleCompat(_ subtitle: String) -> some View {
        if #available(iOS 26.0, *) {
            navigationSubtitle(subtitle)
        } else {
            self
        }
    }

    /// Strips a List row's default chrome so the card rows keep their look:
    /// transparent background, no separators, spacing between cards.
    func terminalRowChrome() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

/// One configured service: name, port, and a live status dot, tappable to open
/// its logs sheet, with a trailing start/stop control (spinning while a toggle
/// is in flight).
private struct ServiceRow: View {
    let service: Service
    let running: Bool
    let pending: Bool
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "server.rack")
                .font(.system(size: 15))
                .foregroundStyle(running ? AnyShapeStyle(.green) : AnyShapeStyle(.secondary))
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(service.name).font(.body.weight(.medium)).lineLimit(1)
                HStack(spacing: 5) {
                    Circle()
                        .fill(running ? Color.green : Color(.systemGray3))
                        .frame(width: 6, height: 6)
                    Text(running ? "Running" : "Stopped")
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    if service.port > 0 {
                        Text(":\(String(service.port))")
                            .font(.caption.monospacedDigit()).foregroundStyle(.tertiary)
                    }
                }
            }
            Spacer(minLength: 4)
            if pending {
                ProgressView().controlSize(.small)
            } else {
                Button(action: onToggle) {
                    Image(systemName: running ? "stop.fill" : "play.fill")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(running ? Color.red : Color.green)
                        .frame(width: 32, height: 32)
                        .background(Color(.tertiarySystemFill), in: Circle())
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 3)
    }
}

/// A row in the project's background-runs section: the action label plus a live
/// status dot, tappable to reopen the run's log sheet.
private struct BackgroundRunRow: View {
    let run: BackgroundRunInfo
    let snapshot: ActionBgOutput?
    let startError: String?

    private var running: Bool { startError == nil && (snapshot?.running ?? true) }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt")
                .font(.system(size: 15))
                .foregroundStyle(SwiftUI.Color.accentColor)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(run.label).font(.body.weight(.medium)).lineLimit(1)
                HStack(spacing: 5) {
                    Circle().fill(statusColor).frame(width: 6, height: 6)
                    Text(statusText).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Spacer(minLength: 4)
            if running {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 3)
    }

    private var statusColor: Color {
        if startError != nil { return .red }
        guard let s = snapshot else { return .blue }
        if s.running { return .blue }
        if s.error == "cancelled" { return .orange }
        return s.success ? .green : .red
    }
    private var statusText: String {
        if startError != nil { return "Couldn't start" }
        guard let s = snapshot else { return "Starting…" }
        if s.running { return "Running" }
        if s.error == "cancelled" { return "Stopped" }
        return s.success ? "Done" : "Failed"
    }
}

private struct TabsSectionHeader: View {
    let count: Int

    var body: some View {
        HStack(spacing: 6) {
            Text("Tabs")
                .textCase(.uppercase)
            if count > 0 {
                Text("\(count)")
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
            }
            Spacer()
        }
        .font(.footnote.weight(.semibold))
        .foregroundStyle(.secondary)
        .listRowInsets(EdgeInsets(top: 4, leading: 24, bottom: 2, trailing: 24))
    }
}

/// The project's control menu in the nav bar: a single "more" button whose native
/// menu holds Start/Stop, the run-actions submenu, and (when present) profiles.
/// Per-service display and toggles live in the list's Services section.
private struct ProjectRunControl: View {
    @EnvironmentObject var model: AppModel
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

    private var running: Bool { project.running }

    private var name: String { project.name }
    private var pulling: Bool { model.gitPulling.contains(name) }
    private var pushing: Bool { model.gitPushing.contains(name) }
    private var fetching: Bool { model.gitFetching.contains(name) }
    private var branch: String { model.gitSnapshots[name]?.branch ?? "" }
    private var ghCli: Bool { model.gitSnapshots[name]?.ghCli ?? false }

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
            Button { model.gitPull(name) } label: { Label("Pull", systemImage: "arrow.down") }
                .disabled(pulling)
            Button { model.gitPush(name) } label: { Label("Push", systemImage: "arrow.up") }
                .disabled(pushing)
            Button { model.gitFetch(name) } label: { Label("Fetch", systemImage: "arrow.triangle.2.circlepath") }
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

/// One terminal card: a terminal-glyph icon tile and the tab name (prefixed with
/// the tab's emoji when set). Tapping the card opens the terminal; the same tab
/// actions as the desktop live on native swipe gestures (Pin from the leading
/// edge; Rename / Close from the trailing edge).
private struct TerminalRow: View {
    let term: TerminalInfo
    let onOpen: () -> Void

    private var title: String {
        term.emoji.isEmpty ? term.label : "\(term.emoji) \(term.label)"
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 16) {
                Image(systemName: "terminal.fill")
                    .font(.system(size: 18, weight: .medium))
                    .foregroundStyle(.secondary)
                    .frame(width: 40, height: 40)
                    .background(Color(.tertiarySystemGroupedBackground),
                                in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                if term.pinned {
                    Image(systemName: "pin.fill")
                        .font(.caption2)
                        .foregroundStyle(.orange)
                }
                if term.remote {
                    Text("Remote")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct EmptyTerminalsView: View {
    let onNew: () -> Void

    var body: some View {
        ContentUnavailableView {
            Label("No Terminals", systemImage: "terminal")
        } description: {
            Text("Open a terminal to work in this project.")
        } actions: {
            Button(action: onNew) {
                Label("New Terminal", systemImage: "plus")
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
        }
    }
}
