import SwiftUI
import UIKit

/// A project's screen: the project's open terminals, services, and background
/// runs as a native list, with a "more" menu in the nav bar for Start/Stop and
/// actions. Terminal tab actions (Pin / Rename / Close, and Fork and the rest of
/// the desktop's tab menu) live on native swipe gestures and the long-press menu.
struct ProjectDetail: View {
    @Environment(AppModel.self) private var model
    let project: Project
    @State private var renaming: TabRename?
    @State private var forkingIntoCopy: TerminalInfo?
    @State private var closingOthers: TerminalInfo?
    @State private var openTerminal: TerminalInfo?
    @State private var activeBgRun: BackgroundRunInfo?
    @State private var logsForService: Service?
    @State private var newTabOpen = false
    @State private var usageRest = UsageRest()
    @State private var barAxis: CGFloat?

    // Current project object (fresh status/actions) from the store; falls back to
    // the one we were pushed with.
    private var live: Project { model.projects.first(where: { $0.name == project.name }) ?? project }
    private var terminals: [TerminalInfo] { model.terminals[project.name] ?? [] }
    // nil vs [] tells "still loading" apart from "no terminals". While the Mac
    // is away an empty list is no answer either: lpm may be restarting, and it
    // brings the tabs back once it's up.
    private var terminalsLoaded: Bool {
        guard let list = model.terminals[project.name] else { return false }
        return !list.isEmpty || model.demoMode || model.link.isReady
    }
    private var queued: [QueuedAction] { model.link.queued(for: project.name) }
    private var creating: Bool { model.creatingTerminals.contains(project.name) }
    private var bgRuns: [BackgroundRunInfo] { model.backgroundRunList(for: project.name) }
    // `services` is the resolved running list; display gates on `running`, and
    // one that ended keeps its place there until restarted or stopped.
    private var runningServices: Set<String> { live.liveServiceNames }
    private var agentRows: [ProjectAgentRow] {
        projectAgentRows(live, now: Int(Date().timeIntervalSince1970 * 1000), tabTitles: [:])
    }
    private var agentByTerminal: [String: ProjectAgentRow] { agentRowsByTerminal(agentRows) }
    /// The person-set status leads the name, as it does in the projects list.
    private var title: String {
        let mark = live.workStatus?.displayEmoji ?? ""
        return mark.isEmpty ? project.label : "\(mark) \(project.label)"
    }
    private var status: String {
        if live.configError != nil { return "Invalid configuration" }
        return live.crashSummary ?? (live.isUp ? "Running" : "Stopped")
    }

    /// Nothing to list at all: the screen shows the "No Terminals" prompt instead.
    private var isEmpty: Bool {
        terminalsLoaded && terminals.isEmpty && !creating && live.allServices.isEmpty && bgRuns.isEmpty
    }

    // Behind the "No Terminals" prompt and the config error there is no list
    // for the usage rows to follow.
    private var showsUsage: Bool { !isEmpty && live.configError == nil }

    var body: some View {
        // One inset-grouped list, so tabs, services and runs read alike and keep
        // native drag-to-reorder via `.onMove`.
        List {
            if !queued.isEmpty {
                Section {
                    ForEach(queued) { QueuedActionLine(action: $0) }
                }
            }
            if !terminalsLoaded {
                ProjectTabsLoadingSection()
            } else if !isEmpty {
                ProjectTabsSection(project: project.name, terminals: terminals, agents: agentByTerminal,
                                   creating: creating, renaming: $renaming,
                                   forkingIntoCopy: $forkingIntoCopy, closingOthers: $closingOthers,
                                   onOpen: { openTerminal = $0 }, onSpawned: openSpawned, onNew: newTab)
            }

            if !live.allServices.isEmpty {
                Section {
                    let ended = live.endedServices
                    ForEach(live.allServices) { s in
                        ServiceRow(service: s,
                                   running: runningServices.contains(s.name),
                                   ended: ended[s.name],
                                   pending: model.pendingServiceToggle[project.name]?[s.name] != nil,
                                   canStop: model.canRestartServices,
                                   onToggle: { model.toggleService(live.name, service: s.name) },
                                   onRestart: { model.restartService(live.name, service: s.name) },
                                   onStop: { model.stopService(live.name, service: s.name) },
                                   onOpen: { logsForService = s })
                            .compactRow()
                    }
                } header: {
                    ServicesHeader(running: runningServices.count, total: live.allServices.count,
                                   stopping: model.pendingRun[project.name] != nil,
                                   onStopAll: live.running ? { model.stopProject(live) } : nil)
                } footer: {
                    Text("Tap a service for its logs.")
                }
            }

            if !bgRuns.isEmpty {
                Section {
                    ForEach(bgRuns) { run in
                        BackgroundRunRow(run: run, snapshot: model.backgroundRuns[run.runId],
                                         startError: model.backgroundRunErrors[run.runId])
                            .contentShape(Rectangle())
                            .onTapGesture { activeBgRun = run }
                            .compactRow()
                    }
                } header: {
                    SectionTitle(text: "Background runs")
                }
            }

            if showsUsage {
                UsageRowsSection(project: live, rest: usageRest)
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(.compact)
        .restsAtBottom($usageRest, present: showsUsage && !model.currentUsageRows(at: .now).isEmpty,
                       ready: terminalsLoaded) { model.loadTerminals(project.name) }
        .feedsUsageRows()
        // Full-space overlay (not a list row): ContentUnavailableView is greedy
        // and inside a row it stretches the row — and its action button — to
        // fill the expanse.
        .overlay {
            if let error = live.configError {
                ProjectConfigErrorView(project: live, message: error)
            } else if isEmpty {
                EmptyTerminalsView(onNew: newTab)
            }
        }
        .animation(.default, value: terminalsLoaded)
        .animation(.default, value: creating)
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).midX } action: { barAxis = $0 }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                ProjectTitle(project: project.name, title: title, status: status, axis: barAxis)
            }
        }
        .followsGitChanges(project.name)
        .topBar { ConnectionStatusBar() }
        .navigationDestination(item: $openTerminal) { TerminalScreen(term: $0, project: live) }
        .tabRenameAlert($renaming)
        .tabMenuConfirmations(forkingIntoCopy: $forkingIntoCopy, closingOthers: $closingOthers)
        .safeAreaInset(edge: .bottom) {
            let pending = model.pendingTabClose
            UndoBar(message: pending.map { "\($0.tab.title) closed" }, id: pending?.tab.id) {
                model.undoTabClose()
            }
        }
        .sheet(item: $activeBgRun) { run in
            BackgroundRunSheet(run: run).environment(model)
        }
        .sheet(item: $logsForService) { s in
            ServiceLogsSheet(project: live.name, service: s).environment(model)
        }
        .sheet(isPresented: $newTabOpen) {
            NewTabSheet(project: live, onOpen: openSpawned).environment(model)
        }
        .projectMenuToolbar(project: live, onSpawnedTerminal: openSpawned)
        .onAppear {
            model.loadTerminals(project.name)
            model.loadBackgroundRuns(project.name)
        }
        .onChange(of: model.link.isReady) { _, ready in
            if ready { model.reloadTerminalsAfterReconnect(project.name) }
        }
        // Keep the background-runs section fresh while it's on screen: poll any run
        // still marked running (or not yet polled) every 3s.
        .task {
            while !Task.isCancelled {
                // Skip while offline — an enqueued poll would just pile up in the
                // send queue and never reach the Mac.
                if case .ready = model.connection {
                    for run in model.backgroundRunList(for: project.name)
                    where model.backgroundRuns[run.runId]?.running ?? true {
                        model.loadBackgroundRunOutput(project: project.name, runId: run.runId)
                    }
                }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
    }

    /// With agents to offer, New tab asks what the tab starts with; otherwise
    /// it opens a shell as it always has.
    private func newTab() {
        if model.canLaunchAgents { newTabOpen = true } else { model.newTerminal(project.name) }
    }

    private func openSpawned(_ t: TerminalInfo) {
        // Claim the desktop-owned terminal before pushing so it renders live.
        model.claimControl(t.id)
        openTerminal = t
    }
}

extension View {
    /// A row with the list's horizontal insets but less of iOS 26's vertical
    /// padding, so rows sit as tight as the rest of the system's grouped lists.
    func compactRow() -> some View {
        listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))
    }
}

private extension View {
    /// A bar over the top of the list. On iOS 26 the list scrolls under it with
    /// the system's scroll edge effect, the way it does under the nav bar.
    @ViewBuilder
    func topBar<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        if #available(iOS 26.0, *) {
            safeAreaBar(edge: .top, content: content)
        } else {
            safeAreaInset(edge: .top, content: content)
        }
    }

    @ViewBuilder
    func navigationSubtitleCompat(_ subtitle: String) -> some View {
        if #available(iOS 26.0, *) {
            navigationSubtitle(subtitle)
        } else {
            self
        }
    }
}

/// A section header in the small all-caps style, whatever the OS's default.
struct SectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.footnote)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
    }
}

/// "Services · 2 of 3 running", with Stop all while the project runs.
private struct ServicesHeader: View {
    let running: Int
    let total: Int
    let stopping: Bool
    let onStopAll: (() -> Void)?

    var body: some View {
        HStack {
            SectionTitle(text: "Services · \(running) of \(total) running")
            Spacer()
            if let onStopAll {
                Button("Stop all", action: onStopAll)
                    .font(.subheadline)
                    .textCase(nil)
                    .disabled(stopping)
            }
        }
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
