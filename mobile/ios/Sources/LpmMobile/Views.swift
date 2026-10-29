import SwiftUI
import UIKit

/// A terminal a task row opens, addressed before the project's tab list has
/// loaded — the same pair `NotificationTerminalDestination` takes.
private struct TerminalTarget: Hashable, Identifiable {
    let project: String
    let terminalId: String

    var id: String { "\(project):\(terminalId)" }
}

private enum NotificationRoute: Hashable {
    case automations
    case terminal(project: String, id: String)
    case automation(project: String, id: String)
    case weeklyRecap
    case changes(project: String)
    case usage
}

// Root view: show pairing until at least one Mac is saved, then the projects list.
struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    // Nav path so a notification tap can deep-link straight to its destination.
    @State private var path = NavigationPath()
    // A notification target whose project the list doesn't have yet.
    @State private var awaitedProject: NotificationOpenTarget?

    var body: some View {
        Group {
            if model.macs.isEmpty {
                NavigationStack { PairingView() }
                    .modifier(SessionAlerts())
            } else {
                NavigationStack(path: $path) { ProjectsView() }
            }
        }
        .modifier(ConnectionSheets())
        .background { AgentWidgetPublisher() }
        .background { LiveActivityPublisher() }
        .background { UsageWidgetPublisher() }
        .onOpenURL { model.openAgentWidgetLink($0) }
        .onChange(of: BuiltInTailscale.shared.status.state) { _, state in model.tailnetChanged(state) }
        .onChange(of: scenePhase) { _, phase in
            AppLock.shared.sceneChanged(phase)
            switch phase {
            case .active:
                BuiltInTailscale.shared.foreground()
                model.setInForeground(true)
                model.reconnectIfNeeded()
            case .background:
                BuiltInTailscale.shared.background()
                model.setInForeground(false)
                model.suspendRecoveryDiscovery()
            default:
                model.suspendRecoveryDiscovery()
            }
        }
        // Consume a pending notification-tap target once its Mac has loaded.
        .onChange(of: model.pendingNotificationTarget) { _, _ in consumePendingOpen() }
        .onChange(of: model.projectsLoaded) { _, _ in consumePendingOpen() }
        .onChange(of: model.activeMacId) { _, _ in consumePendingOpen() }
        .onChange(of: model.projects.map(\.name)) { _, _ in
            consumePendingOpen()
            if !model.demoMode { FocusProjects.remember(model.projects) }
        }
        // The list can trail a brand-new project (a duplicate or worktree made while
        // the phone was away), so give it a moment — then drop the target rather
        // than jump there at some unrelated later moment.
        .task(id: awaitedProject) {
            guard let target = awaitedProject else { return }
            try? await Task.sleep(nanoseconds: 10_000_000_000)
            guard !Task.isCancelled else { return }
            if model.pendingNotificationTarget == target { model.pendingNotificationTarget = nil }
            awaitedProject = nil
        }
        .onAppear {
            AppLock.shared.sceneChanged(scenePhase)
            BuiltInTailscale.shared.foreground()
            model.bootstrap()
            // Warm WebKit now so the first terminal opens without the ~2s cold start.
            TerminalWebPool.prewarm()
        }
    }

    private func consumePendingOpen() {
        guard let target = model.pendingNotificationTarget else { return }
        if let serverId = target.serverId, model.activeRecord?.serverId != serverId {
            // A Mac this phone no longer has: nothing to open.
            guard let mac = model.macs.first(where: { $0.serverId == serverId }) else {
                model.pendingNotificationTarget = nil
                return
            }
            path = NavigationPath()
            model.notificationOpens += 1
            model.switchTo(mac)
            return
        }
        guard model.projectsLoaded else { return }

        let known = model.projects.contains(where: { $0.name == target.project })
        var next = NavigationPath()
        switch target.kind {
        case .project:
            guard known else { awaitedProject = target; return }
            next.append(target.project)
        case .terminal:
            guard let id = target.itemId, known else { awaitedProject = target; return }
            next.append(target.project)
            next.append(NotificationRoute.terminal(project: target.project, id: id))
        case .automation:
            guard let id = target.itemId else { return }
            next.append(NotificationRoute.automations)
            next.append(NotificationRoute.automation(project: target.project, id: id))
        case .recap:
            next.append(NotificationRoute.weeklyRecap)
        case .changes:
            guard known else { awaitedProject = target; return }
            next.append(target.project)
            next.append(NotificationRoute.changes(project: target.project))
        case .usage:
            next.append(NotificationRoute.usage)
        }
        path = next
        model.notificationOpens += 1
        model.pendingNotificationTarget = nil
    }
}

struct ProjectsView: View {
    @Environment(AppModel.self) private var model
    @State private var expandedOverride: [String: Bool] = [:]
    @State private var showingSettings = false
    @State private var addingProject = false
    // The duplicate pending removal-confirmation. Removing deletes its folder from
    // disk, so it always routes through a confirmation dialog.
    @State private var removing: Project?
    // The project whose duplicate-options sheet is open. Duplicating opens the
    // options sheet (count, label, git toggles) rather than firing immediately.
    @State private var duplicating: Project?
    // Sidebar folder flows. `newFolderForProject` moves that project into a
    // freshly-named folder; `renamingFolder` renames it; `deletingFolder` confirms
    // its removal; `creatingFolder` makes a new empty folder. `folderNameText` backs
    // whichever text alert is open.
    @State private var newFolderForProject: Project?
    @State private var renamingFolder: ProjectFolder?
    @State private var deletingFolder: ProjectFolder?
    @State private var creatingFolder = false
    @State private var folderNameText = ""
    // The terminal a tapped task row opens. A task row is not a disclosure row —
    // it pushes without the chevron a NavigationLink would draw.
    @State private var openTerminal: TerminalTarget?
    @State private var visiting: MachineVisit?
    @State private var screenWidth: CGFloat = 0
    @State private var usageRest = UsageRest()
    // Projects whose folded seen agents are open.
    @State private var seenExpanded: Set<String> = []

    private func isExpanded(_ g: ProjectFolder) -> Bool { expandedOverride[g.id] ?? !g.collapsed }

    private func agentRows(_ project: Project,
                           tabTitles: [String: String]? = nil) -> [ProjectAgentRow] {
        projectAgentRows(project, now: Int(Date().timeIntervalSince1970 * 1000),
                         tabTitles: tabTitles ?? model.activityTerminalTitles[project.name] ?? [:])
    }

    /// A project's agents, with its seen ones from a Mac that archives agents.
    private func listedAgents(_ project: Project) -> [ProjectAgentRow] {
        guard model.canArchiveAgents else { return agentRows(project) }
        return projectAgentList(project, now: Int(Date().timeIntervalSince1970 * 1000),
                                tabTitles: model.activityTerminalTitles[project.name] ?? [:],
                                hiding: model.archivingAgentKeys(project.name))
    }

    private var listIsEmpty: Bool { model.projects.isEmpty && model.machineSections.isEmpty }

    @ViewBuilder
    private func sidebarRow(_ item: SidebarItem) -> some View {
        switch item {
        case .project(let row):
            projectLink(row, indented: false)
        case .folder(let g, let members):
            FolderHeader(name: g.name, count: members.filter { !$0.isChild }.count, expanded: isExpanded(g)) {
                expandedOverride[g.id] = !isExpanded(g)
            }
            .contextMenu {
                Button { folderNameText = g.name; renamingFolder = g } label: {
                    Label("Rename folder", systemImage: "pencil")
                }
                Button(role: .destructive) { deletingFolder = g } label: {
                    Label("Delete folder", systemImage: "trash")
                }
            }
            if isExpanded(g) {
                ForEach(members) { row in
                    projectLink(row, indented: true)
                }
            }
        case .machine(let section):
            let key = "m:" + section.id
            let open = expandedOverride[key] ?? true
            MachineHeader(section: section, expanded: open) { expandedOverride[key] = !open }
            if open {
                ForEach(section.rows) { row in
                    machineProjectLink(row, in: section)
                }
            }
        }
    }

    /// A project of one of the Mac's machines. It lives on that machine, so it
    /// opens in a session of its own — directly, or through the Mac when the
    /// machine isn't on this phone — while this Mac stays connected.
    @ViewBuilder
    private func machineProjectLink(_ row: SidebarRow, in section: MachineSection) -> some View {
        let agents = agentRows(row.project, tabTitles: [:])
        let indent: CGFloat = 20
        Button {
            visiting = model.beginVisit(section, project: row.project.name)
        } label: {
            HStack {
                ProjectRow(project: row.project, agentCount: agents.count, stale: isStale, showsQueued: false)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .padding(.leading, indent)
            .foregroundStyle(section.canOpen ? Color.primary : Color.secondary)
        }
        .disabled(!section.canOpen)
        .listRowSeparator(agents.isEmpty ? .automatic : .hidden, edges: .bottom)

        if !agents.isEmpty {
            ProjectTerminalDeck(project: row.project.name, rows: agents, indent: indent) { agent in
                if let terminal = agent.terminalId {
                    visiting = model.beginVisit(section, project: row.project.name, terminal: terminal)
                }
            }
            .disabled(!section.canOpen)
        }
    }

    @ViewBuilder
    private func projectLink(_ row: SidebarRow, indented: Bool) -> some View {
        let name = row.project.name
        let agents = listedAgents(row.project)
        let fold = foldSeenAgents(agents, shown: model.seenAgentsShown, expanded: seenExpanded.contains(name))
        let indent: CGFloat = indented ? 20 : 0
        NavigationLink(value: name) {
            ProjectRow(project: row.project,
                       pending: model.pendingRun[name] != nil,
                       agentCount: agents.filter { !$0.seen }.count,
                       stale: isStale)
                .padding(.leading, indent)
        }
        .projectRowActions(row.project, removing: $removing, duplicating: $duplicating,
                           newFolderForProject: $newFolderForProject)
        // A project holding a deck runs into it with no rule between them: the two
        // rows are one cell, and the deck's own separator closes it.
        .listRowSeparator(agents.isEmpty ? .automatic : .hidden, edges: .bottom)

        if !agents.isEmpty {
            ProjectTerminalDeck(project: name, rows: fold.rows, folded: fold.folded,
                                expanded: seenExpanded.contains(name),
                                toggleFold: { seenExpanded.formSymmetricDifference([name]) },
                                archivable: model.canArchiveAgents, indent: indent) { agent in
                if let terminal = agent.terminalId {
                    openTerminal = TerminalTarget(project: name, terminalId: terminal)
                }
            }
        }
    }

    /// The list on screen is the one saved from the last connection, not live.
    private var isStale: Bool { model.link.listAsOf != nil && !model.link.isReady }

    /// When the saved list was last live, once a reconnect has gone on long
    /// enough to matter.
    private var listAge: Date? {
        guard isStale, !model.link.quietReconnect else { return nil }
        return model.link.listAsOf
    }

    var body: some View {
        List {
            Section {
                ForEach(model.sidebarItems) { item in
                    sidebarRow(item)
                }
            } header: {
                if let asOf = listAge {
                    Text("Updated \(asOf.clockStamp)")
                        .textCase(nil)
                }
            } footer: {
                if listAge != nil {
                    // A Mac that revoked this device is up; it just won't take
                    // anything from it, so there is nothing to wait for.
                    if model.needsRepair || model.link.identityRejected {
                        Text("Projects open read-only until this \(ThisDevice.noun) is paired with \(model.link.macLabel) again.")
                    } else {
                        Text("Projects open read-only until your Mac is back. Start and Stop wait for it, for up to 2 minutes.")
                    }
                }
            }
            if !listIsEmpty {
                UsageRowsSection(rest: usageRest)
            }
        }
        .restsAtBottom($usageRest, present: !listIsEmpty && !model.currentUsageRows(at: .now).isEmpty,
                       ready: model.projectsLoaded) { await model.refreshProjects() }
        .feedsUsageRows()
        .safeAreaInset(edge: .bottom) {
            UndoBar(message: model.pendingAgentArchive?.message) { model.undoAgentArchive() }
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { screenWidth = $0 }
        .task(id: model.macs.count) {
            while model.macs.count > 1 && !Task.isCancelled {
                model.link.refreshReach()
                try? await Task.sleep(nanoseconds: 60_000_000_000)
            }
        }
        // Terminal rows are named after the tab they run in, and only the Mac knows
        // those names. Keyed on which projects have agents so the ask lands after
        // the project list itself has arrived, and again whenever an agent starts
        // somewhere new — a bare `.task` fires once, against an empty list.
        .task(id: model.projects.filter(\.hasAgentStatus).map(\.name)) {
            model.loadActivityTerminals()
        }
        .navigationDestination(item: $openTerminal) { target in
            NotificationTerminalDestination(projectName: target.project,
                                            terminalId: target.terminalId)
        }
        .navigationDestination(item: $visiting) { MachineVisitScreen(visit: $0) }
        .onChange(of: visiting) { _, now in if now == nil { model.leaveVisit() } }
        .onChange(of: model.visitSession == nil) { _, ended in if ended { visiting = nil } }
        // Whatever was opened on another machine, from here or from Activity, is
        // off screen once the list is back.
        .onAppear { model.leaveVisit() }
        .onChange(of: model.notificationOpens) { _, _ in
            openTerminal = nil
            visiting = nil
            model.leaveVisit()
        }
        .navigationTitle("Projects")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                MacTitle(screenWidth: screenWidth)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    NavigationLink {
                        ActivityScreen()
                    } label: {
                        Label("Activity", systemImage: "square.stack.3d.up")
                    }
                    NavigationLink(value: NotificationRoute.automations) {
                        // A menu row can't carry a badge, so the count rides in
                        // the label — the dot on the button is what says the menu
                        // is worth opening at all.
                        Label(model.automationsUnread > 0
                              ? "Automations (\(model.automationsUnread))" : "Automations",
                              systemImage: "clock.arrow.circlepath")
                    }
                    NavigationLink {
                        StatsScreen()
                    } label: {
                        Label("Stats", systemImage: "chart.bar")
                    }
                    NavigationLink {
                        UsageScreen()
                    } label: {
                        Label("Usage", systemImage: "speedometer")
                    }
                    Button { showingSettings = true } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                    if model.macUpdate.canUpdate {
                        Button { model.macUpdate.checkNow() } label: {
                            Label("Check for lpm Updates…", systemImage: "arrow.down.circle")
                        }
                        .disabled(!model.macUpdate.canCheck || !model.link.isReady)
                    }
                    Divider()
                    Button { addingProject = true } label: {
                        Label("Add Project…", systemImage: "plus.rectangle.on.folder")
                    }
                    Button { folderNameText = ""; creatingFolder = true } label: {
                        Label("New Folder…", systemImage: "folder.badge.plus")
                    }
                    PairDirectlyMenuItems()
                } label: {
                    // An agent waiting on you lives one tap deep, under Activity —
                    // the dot is what says the menu is worth opening.
                    Image(systemName: "ellipsis")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.primary)
                        .overlay(alignment: .topTrailing) {
                            let ambient = agentAmbient(model.ambientProjects)
                            // An agent waiting on you outranks an automation that
                            // merely has something to read.
                            if ambient.isLit {
                                Circle()
                                    .fill(ambient.needsYou > 0 ? Color.orange : Color.red)
                                    .frame(width: 7, height: 7)
                                    .offset(x: 5, y: -5)
                            } else if model.automationsUnread > 0 {
                                Circle()
                                    .fill(Color.accentColor)
                                    .frame(width: 7, height: 7)
                                    .offset(x: 5, y: -5)
                            }
                        }
                        .accessibilityLabel(agentAmbient(model.ambientProjects).needsYou > 0
                                            ? "More — an agent needs you"
                                            : model.automationsUnread > 0
                                              ? "More — automations have new messages"
                                              : "More")
                }
            }
        }
        .navigationDestination(for: String.self) { name in
            if let p = model.projects.first(where: { $0.name == name }) {
                ProjectDetail(project: p)
            }
        }
        .navigationDestination(for: NotificationRoute.self) { route in
            switch route {
            case .automations:
                AutomationsView()
            case .terminal(let project, let id):
                NotificationTerminalDestination(projectName: project, terminalId: id)
            case .automation(let project, let id):
                AutomationDetailView(project: project, jobId: id)
            case .weeklyRecap:
                WeeklyRecapScreen()
            case .changes(let name):
                if let p = model.projects.first(where: { $0.name == name }) {
                    GitReviewView(project: p)
                }
            case .usage:
                UsageScreen()
            }
        }
        // A bar above the list only for a problem with a fix on this iPhone. A
        // list with nothing to show puts any problem in its place instead.
        .safeAreaInset(edge: .top) {
            if !listIsEmpty {
                ConnectionStatusBar()
            }
        }
        .overlay {
            if listIsEmpty {
                if let issue = model.link.visibleIssue, !issue.isConnecting {
                    IssueCard(issue: issue)
                        .padding(.horizontal, 20)
                } else if model.projectsLoaded {
                    ContentUnavailableView("No projects", systemImage: "folder")
                } else {
                    ProjectListSkeleton()
                }
            }
        }
        .animation(.default, value: model.projectsLoaded)
        .animation(.default, value: model.link.visibleIssue)
        .animation(.default, value: listAge)
        .sheet(isPresented: Binding(get: { model.addingMac }, set: { model.addingMac = $0 }),
               onDismiss: { model.cancelAddMac() }) {
            NavigationStack {
                PairingView(onCancel: { model.addingMac = false })
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .confirmationDialog(
            "Remove duplicate?",
            isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
            titleVisibility: .visible,
            presenting: removing
        ) { p in
            Button("Remove", role: .destructive) { Haptics.warning(); model.removeProject(p); removing = nil }
            Button("Cancel", role: .cancel) { removing = nil }
        } message: { p in
            Text(CopyRemoval.message(for: p, snapshot: model.git.snapshots[p.name],
                                     checking: model.git.loading.contains(p.name)))
        }
        .onChange(of: removing?.name) { _, name in
            if let name { model.git.load(name) }
        }
        .modifier(SessionAlerts())
        .sheet(item: $duplicating) { p in
            DuplicateOptionsView(project: p, defaults: model.duplicateDefaults) { options in
                model.duplicateProject(p, options: options)
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheet()
        }
        .sheet(isPresented: $addingProject) {
            AddProjectSheet()
        }
        .modifier(FolderManagementModals(
            creatingFolder: $creatingFolder,
            newFolderForProject: $newFolderForProject,
            renamingFolder: $renamingFolder,
            deletingFolder: $deletingFolder,
            folderNameText: $folderNameText
        ))
        .safeAreaInset(edge: .bottom) {
            if let progress = model.duplicateProgress {
                DuplicateProgressBar(progress: progress)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .safeAreaInset(edge: .bottom) {
            MacUpdateBar()
        }
        .animation(.default, value: model.macUpdate.showsBar)
        .safeAreaInset(edge: .top) {
            if model.demoMode {
                DemoBanner { model.exitDemo() }
            }
        }
        .animation(.default, value: model.duplicateProgress == nil)
    }
}

/// A slim banner across the top of the projects list while Demo Mode is active,
/// with an Exit affordance back to the pairing screen.
struct DemoBanner: View {
    let onExit: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "play.circle.fill")
                .font(.footnote.weight(.semibold))
            Text("Demo — sample projects")
                .font(.footnote.weight(.medium))
            Spacer()
            Button("Exit", action: onExit)
                .font(.footnote.weight(.semibold))
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(.purple)
    }
}

/// Opens a terminal named only by its id — the destination behind a notification
/// tap and behind an Activity row, both of which know the terminal before the
/// project's tab list has loaded.
struct NotificationTerminalDestination: View {
    @Environment(AppModel.self) private var model
    let projectName: String
    let terminalId: String

    private var project: Project? {
        model.projects.first { $0.name == projectName }
    }

    private var terminal: TerminalInfo? {
        model.terminals[projectName]?.first { $0.id == terminalId }
    }

    var body: some View {
        Group {
            if let project, let terminal {
                TerminalScreen(term: terminal, project: project)
            } else if model.terminals[projectName] != nil {
                ContentUnavailableView("Terminal unavailable", systemImage: "terminal")
                    .navigationTitle("Terminal")
                    .navigationBarTitleDisplayMode(.inline)
            } else {
                ProgressView("Opening terminal…")
                    .navigationTitle("Terminal")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        // Again after a Mac switch or a reconnect: switching clears the list this
        // waits on, and a bare `.task` would never ask for it again.
        .task(id: "\(model.activeMacId?.uuidString ?? "")-\(model.connection == .ready)") {
            model.loadTerminals(projectName)
        }
    }
}

/// A bottom HUD shown while a duplicate batch runs, streaming per-copy progress.
private struct DuplicateProgressBar: View {
    let progress: DuplicateProgress

    var body: some View {
        HStack(spacing: 12) {
            ProgressView().controlSize(.small)
            VStack(alignment: .leading, spacing: 2) {
                Text("Duplicating \(progress.source)")
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)
                Text(progress.total > 0 ? "\(progress.done) of \(progress.total)" : "Working…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            Spacer()
            if progress.total > 1 {
                ProgressView(value: Double(progress.done), total: Double(progress.total))
                    .frame(width: 64)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
        .padding(.bottom, 6)
    }
}

/// The project-list row actions, matching the desktop context menu but scoped to
/// what's safe from a phone: Duplicate for any local project, and Remove for a
/// duplicate (which deletes its folder). Offered as both a swipe and a long-press
/// context menu; Remove always routes through a confirmation via `removing`.
/// The four sidebar-folder dialogs (new folder, new-folder-and-move, rename,
/// delete), grouped off the projects list so its modifier chain stays small enough
/// for the type-checker. `folderNameText` backs whichever text alert is open.
private struct FolderManagementModals: ViewModifier {
    @Environment(AppModel.self) private var model
    @Binding var creatingFolder: Bool
    @Binding var newFolderForProject: Project?
    @Binding var renamingFolder: ProjectFolder?
    @Binding var deletingFolder: ProjectFolder?
    @Binding var folderNameText: String

    func body(content: Content) -> some View {
        content
            .alert("New folder", isPresented: $creatingFolder) {
                TextField("Folder name", text: $folderNameText)
                Button("Cancel", role: .cancel) {}
                Button("Create") { model.createFolder(name: folderNameText) }
            }
            .alert("New folder", isPresented: Binding(
                get: { newFolderForProject != nil },
                set: { if !$0 { newFolderForProject = nil } }
            ), presenting: newFolderForProject) { p in
                TextField("Folder name", text: $folderNameText)
                Button("Cancel", role: .cancel) {}
                Button("Create & move") { model.moveProject(p, toFolder: folderNameText) }
            } message: { p in
                Text("Move “\(p.label)” into a new folder.")
            }
            .alert("Rename folder", isPresented: Binding(
                get: { renamingFolder != nil },
                set: { if !$0 { renamingFolder = nil } }
            ), presenting: renamingFolder) { folder in
                TextField("Folder name", text: $folderNameText)
                Button("Cancel", role: .cancel) {}
                Button("Save") { model.renameFolder(folder, newName: folderNameText) }
            }
            .confirmationDialog(
                "Delete folder?",
                isPresented: Binding(get: { deletingFolder != nil }, set: { if !$0 { deletingFolder = nil } }),
                titleVisibility: .visible,
                presenting: deletingFolder
            ) { folder in
                Button("Delete folder", role: .destructive) { model.deleteFolder(folder) }
                Button("Cancel", role: .cancel) {}
            } message: { folder in
                Text("“\(folder.name)” is removed and its projects move back out to the top level. The projects themselves aren't deleted.")
            }
    }
}

private struct ProjectRowActions: ViewModifier {
    @Environment(AppModel.self) private var model
    let project: Project
    @Binding var removing: Project?
    @Binding var duplicating: Project?
    // Set to present the "new folder" alert that moves this project into it.
    @Binding var newFolderForProject: Project?
    // The status waiting on its line before it lands on the row.
    @State private var noteFor: WorkStatusChoice?

    // The folder this project currently sits in (nil = top level), so the menu can
    // offer "No folder" and skip the folder it's already in.
    private var currentFolderId: String? {
        model.groups.first(where: { $0.members.contains(project.name) })?.id
    }

    func body(content: Content) -> some View {
        content
            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if project.isDuplicate {
                    Button(role: .destructive) { removing = project } label: {
                        Label("Remove", systemImage: "trash")
                    }
                }
                if !project.isRemote {
                    Button { duplicating = project } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                    .tint(.indigo)
                }
            }
            .contextMenu {
                if !project.running, !project.profiles.isEmpty {
                    Menu {
                        ForEach(project.profiles) { p in
                            Button(p.name) { model.startProject(project, profile: p.name) }
                        }
                    } label: {
                        Label("Start with profile", systemImage: "play.circle")
                    }
                }
                if project.canHaveWorkStatus {
                    WorkStatusMenu(project: project, noteFor: $noteFor)
                }
                if !project.isRemote {
                    moveToFolderMenu
                    Button { duplicating = project } label: {
                        Label("Duplicate", systemImage: "plus.square.on.square")
                    }
                }
                if project.isDuplicate {
                    Button(role: .destructive) { removing = project } label: {
                        Label("Remove duplicate", systemImage: "trash")
                    }
                }
            }
            .workStatusNotePrompt(project: project, noteFor: $noteFor)
    }

    private var moveToFolderMenu: some View {
        Menu {
            ForEach(model.groups) { folder in
                if folder.id != currentFolderId {
                    Button(folder.name) { model.moveProject(project, toFolder: folder.name) }
                }
            }
            Button { newFolderForProject = project } label: {
                Label("New folder…", systemImage: "folder.badge.plus")
            }
            if currentFolderId != nil {
                Divider()
                Button { model.moveProject(project, toFolder: nil) } label: {
                    Label("No folder", systemImage: "folder.badge.minus")
                }
            }
        } label: {
            Label("Move to folder", systemImage: "folder")
        }
    }
}

private extension View {
    func projectRowActions(
        _ project: Project,
        removing: Binding<Project?>,
        duplicating: Binding<Project?>,
        newFolderForProject: Binding<Project?>
    ) -> some View {
        modifier(ProjectRowActions(project: project, removing: removing,
                                   duplicating: duplicating, newFolderForProject: newFolderForProject))
    }
}

struct FolderHeader: View {
    let name: String
    let count: Int
    let expanded: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(spacing: 8) {
                Image(systemName: expanded ? "chevron.down" : "chevron.right")
                    .font(.caption2).foregroundStyle(.secondary)
                Text(name).fontWeight(.medium)
                Spacer()
                Text("\(count)").font(.caption).foregroundStyle(.secondary)
            }
        }
        .buttonStyle(.plain)
    }
}

struct ProjectRow: View {
    @Environment(AppModel.self) private var model
    let project: Project
    var pending: Bool = false
    /// How many terminals the project has going. What each of them is doing is in
    /// the deck underneath, so the row itself only counts them.
    var agentCount: Int = 0
    /// From the list saved at the last connection: what was running then, not now.
    var stale: Bool = false
    /// Starts and stops waiting on the live Mac. Off for another machine's
    /// project, whose name can match one of the Mac's own.
    var showsQueued: Bool = true

    var body: some View {
        HStack {
            Group {
                if pending {
                    ProgressView().controlSize(.mini)
                } else if project.configError != nil {
                    Circle().fill(.red).frame(width: 8, height: 8)
                        .accessibilityLabel("Config error")
                } else {
                    RunningDot(running: project.isUp, stale: stale, crashed: project.crashSummary)
                }
            }
            .frame(width: 14)
            if let status = project.workStatus {
                WorkStatusMark(status: status)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(project.label)
                    .foregroundStyle(project.configError == nil ? .primary : .secondary)
                if let status = project.workStatus, let note = status.note {
                    WorkStatusNoteLine(status: status, note: note)
                }
                if showsQueued {
                    ForEach(model.link.queued(for: project.name)) { action in
                        QueuedActionLine(action: action)
                    }
                }
            }
            Spacer()
            if agentCount > 0 {
                Text("\(agentCount)")
                    .font(.caption.weight(.semibold))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .frame(minWidth: 20, minHeight: 20)
                    .background(Color(.tertiarySystemFill), in: Capsule())
                    .accessibilityLabel(agentCount == 1 ? "1 terminal" : "\(agentCount) terminals")
            }
        }
    }
}

/// The green (running) / grey (stopped) status dot, shared across the projects
/// list and the project detail header. Red when a service it started crashed.
struct RunningDot: View {
    let running: Bool
    var size: CGFloat = 8
    /// Last known, not live: a running project shows as a ring, not a lit dot.
    var stale: Bool = false
    /// Which started services crashed ("web exited with code 1"); nil when none.
    var crashed: String? = nil

    var body: some View {
        if let crashed, !stale {
            Circle()
                .fill(.red)
                .frame(width: size, height: size)
                .accessibilityLabel(crashed)
        } else if stale && running {
            Circle()
                .strokeBorder(Color.secondary, lineWidth: 1.5)
                .frame(width: size, height: size)
        } else {
            Circle()
                .fill(running && !stale ? .green : .secondary)
                .frame(width: size, height: size)
        }
    }
}

/// A Start, Stop or Run tapped while the Mac was away, shown on its project:
/// waiting (with Cancel), or not sent after the wait ran out (with Try again).
struct QueuedActionLine: View {
    @Environment(AppModel.self) private var model
    let action: QueuedAction

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: action.expired ? "exclamationmark.circle" : "clock")
            Text(action.expired ? "\(action.verb) wasn't sent" : "\(action.verb) · waiting for the Mac")
            Text("·")
            Button(action.expired ? "Try again" : "Cancel") {
                if action.expired { model.link.retryQueued(action.id) } else { model.link.cancelQueued(action.id) }
            }
            .buttonStyle(.borderless)
            .fontWeight(.semibold)
            if action.expired {
                Button {
                    model.link.cancelQueued(action.id)
                } label: {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.borderless)
                .accessibilityLabel("Dismiss")
            }
        }
        .font(.caption)
        .foregroundStyle(action.expired ? Color.red : Color.orange)
    }
}

/// Shown in place of the terminal when another surface (a desktop window or
/// another phone) currently owns it. "Take control" moves ownership here.
struct ControlHandoffView: View {
    let ownerLabel: String
    var background: Color = .black
    let onTakeControl: () -> Void
    @State private var taking = false

    var body: some View {
        ZStack {
            // Match the terminal's ground so there's no flash behind it.
            background
            ContentUnavailableView {
                Label("Active on \(ownerLabel)", systemImage: "terminal.fill")
            } description: {
                Text("This terminal is shown and controlled elsewhere.")
            } actions: {
                Button {
                    Haptics.tap()
                    taking = true
                    onTakeControl()
                } label: {
                    Text(taking ? "Taking control…" : "Take control")
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .disabled(taking)
            }
        }
        .environment(\.colorScheme, .dark)
        // The view is removed on a successful claim; if the claim fails or is
        // dropped, recover so the button becomes tappable again instead of
        // spinning "Taking control…" forever.
        .task(id: taking) {
            guard taking else { return }
            try? await Task.sleep(nanoseconds: 5_000_000_000)
            if !Task.isCancelled { taking = false }
        }
    }
}
