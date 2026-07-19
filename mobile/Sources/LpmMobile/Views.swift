import SwiftUI
import UIKit

private enum NotificationRoute: Hashable {
    case automations
    case terminal(project: String, id: String)
    case automation(project: String, id: String)
}

// Root view: show pairing until at least one Mac is saved, then the projects list.
struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    // Nav path so a notification tap can deep-link straight to its destination.
    @State private var path = NavigationPath()

    var body: some View {
        Group {
            if model.macs.isEmpty {
                PairingView()
            } else {
                NavigationStack(path: $path) { ProjectsView() }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.reconnectIfNeeded() }
            else { model.suspendRecoveryDiscovery() }
        }
        // Consume a pending notification-tap target once its Mac has loaded.
        .onChange(of: model.pendingNotificationTarget) { _, _ in consumePendingOpen() }
        .onChange(of: model.projectsLoaded) { _, _ in consumePendingOpen() }
        .onChange(of: model.activeMacId) { _, _ in consumePendingOpen() }
        .onAppear {
            model.bootstrap()
            // Warm WebKit now so the first terminal opens without the ~2s cold start.
            TerminalWebPool.prewarm()
        }
    }

    private func consumePendingOpen() {
        guard let target = model.pendingNotificationTarget else { return }
        if let serverId = target.serverId, model.activeRecord?.serverId != serverId {
            guard let mac = model.macs.first(where: { $0.serverId == serverId }) else { return }
            path = NavigationPath()
            model.switchTo(mac)
            return
        }
        guard model.projectsLoaded else { return }

        var next = NavigationPath()
        switch target.kind {
        case .project:
            guard model.projects.contains(where: { $0.name == target.project }) else { return }
            next.append(target.project)
        case .terminal:
            guard let id = target.itemId,
                  model.projects.contains(where: { $0.name == target.project }) else { return }
            next.append(target.project)
            next.append(NotificationRoute.terminal(project: target.project, id: id))
        case .automation:
            guard let id = target.itemId else { return }
            next.append(NotificationRoute.automations)
            next.append(NotificationRoute.automation(project: target.project, id: id))
        }
        path = next
        model.pendingNotificationTarget = nil
    }
}

struct PairingView: View {
    // Non-nil when shown as the "Add a Mac" sheet: adds a Cancel button that
    // returns to the projects list (reconnecting the previously active Mac).
    var onCancel: (() -> Void)? = nil
    @Environment(AppModel.self) private var model
    @State private var host = ""
    @State private var port = "8765"
    @State private var code = ""
    @State private var scanning = false
    @State private var scannedHosts: [String] = []
    // Local-network discovery, running only while this screen is visible.
    @State private var discovery = MacDiscovery()
    @State private var resolvingNearbyId: String?
    // The nearby Mac last tapped and the address its resolution filled in, so the
    // row shows a checkmark only while the address field still holds that address.
    @State private var lastResolvedNearbyId: String?
    @State private var lastResolvedNearbyHost: String?

    private var trimmedHost: String {
        host.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var trimmedCode: String {
        code.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The typed host plus any other addresses the QR advertised (e.g. the
    /// Tailscale IP), typed one first, deduped. Pairing probes all of them so a
    /// scan that autofills the LAN IP still reaches the Mac over the tailnet.
    private var pairHosts: [String] {
        ([trimmedHost] + scannedHosts).reduce(into: [String]()) { acc, h in
            if !h.isEmpty && !acc.contains(h) { acc.append(h) }
        }
    }

    private var canPair: Bool {
        !trimmedHost.isEmpty && !trimmedCode.isEmpty
    }

    /// The nearby row to mark selected: the one whose resolved address still
    /// matches what's typed in the address field (cleared if the user edits it).
    private var selectedNearbyId: String? {
        guard let id = lastResolvedNearbyId, let h = lastResolvedNearbyHost, trimmedHost == h else { return nil }
        return id
    }

    /// Fill the address fields from a nearby Mac the user tapped. Discovery only
    /// supplies the address — the user still enters the pairing code — so this
    /// never bypasses pairing auth.
    private func selectNearby(_ mac: MacDiscovery.DiscoveredMac) {
        resolvingNearbyId = mac.id
        Task {
            let resolved = await discovery.resolve(mac)
            resolvingNearbyId = nil
            guard let resolved else { return }
            host = resolved.host
            port = String(resolved.port)
            scannedHosts = []
            lastResolvedNearbyId = mac.id
            lastResolvedNearbyHost = resolved.host
        }
    }

    private var isPairing: Bool {
        if case .connecting = model.connection { return true }
        return false
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 14) {
                    Image(systemName: "macbook.and.iphone")
                        .font(.system(size: 42, weight: .semibold))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(.blue)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Pair with your Mac")
                            .font(.largeTitle.weight(.bold))

                        Text("Open lpm Settings on your Mac, add a mobile device, then scan the QR code or enter the pairing details.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(.top, 28)

                Button {
                    scanning = true
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: "qrcode.viewfinder")
                            .font(.system(size: 23, weight: .medium))
                            .foregroundStyle(.white)
                            .frame(width: 42, height: 42)
                            .background(.blue, in: RoundedRectangle(cornerRadius: 12, style: .continuous))

                        VStack(alignment: .leading, spacing: 3) {
                            Text("Scan QR Code")
                                .font(.headline)
                                .foregroundStyle(.primary)
                            Text("Use the code from lpm on your Mac")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                    .padding(16)
                    .background(
                        Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                }
                .buttonStyle(.plain)

                if !discovery.found.isEmpty {
                    NearbyMacsView(
                        macs: discovery.found,
                        pairedServerIds: Set(model.macs.compactMap { $0.serverId }),
                        resolvingId: resolvingNearbyId,
                        selectedId: selectedNearbyId,
                        onPick: selectNearby
                    )
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("ENTER MANUALLY")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)

                    VStack(spacing: 0) {
                        PairingFieldRow(
                            systemImage: "network",
                            placeholder: "Mac host or Tailnet IP",
                            text: $host,
                            keyboardType: .URL,
                            autocapitalization: .never
                        )

                        Divider().padding(.leading, 56)

                        PairingFieldRow(
                            systemImage: "number",
                            placeholder: "Port",
                            text: $port,
                            keyboardType: .numberPad,
                            autocapitalization: .never
                        )

                        Divider().padding(.leading, 56)

                        PairingFieldRow(
                            systemImage: "key",
                            placeholder: "Pairing code",
                            text: $code,
                            autocapitalization: .characters
                        )
                    }
                    .background(
                        Color(uiColor: .secondarySystemGroupedBackground),
                        in: RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
                }

                VStack(spacing: 12) {
                    Button {
                        model.pair(hosts: pairHosts, port: Int(port) ?? 8765, code: trimmedCode)
                    } label: {
                        HStack(spacing: 8) {
                            if isPairing { ProgressView().controlSize(.small) }
                            Text(isPairing ? "Pairing…" : "Pair").font(.headline)
                        }
                        .frame(maxWidth: .infinity, minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.roundedRectangle(radius: 14))
                    .disabled(!canPair || isPairing)

                    if case .failed(let err) = model.connection {
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                            .padding(.horizontal)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 32)
        }
        .scrollDismissesKeyboard(.interactively)
        .onAppear { discovery.start() }
        .onDisappear { discovery.stop() }
        .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
        .toolbar {
            if let onCancel {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { onCancel() }
                }
            }
        }
        .sheet(isPresented: $scanning) {
            QRScannerView { payload in
                host = payload.host
                port = String(payload.port)
                code = payload.code
                scannedHosts = payload.hosts
                model.pair(hosts: payload.hosts, port: payload.port, code: payload.code)
            }
        }
    }
}

struct PairingFieldRow: View {
    let systemImage: String
    let placeholder: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var autocapitalization: TextInputAutocapitalization? = nil

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(.secondary)
                .frame(width: 26)

            TextField(placeholder, text: $text)
                .font(.body)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(autocapitalization)
                .autocorrectionDisabled()
        }
        .frame(minHeight: 52)
        .padding(.horizontal, 16)
    }
}

struct ProjectsView: View {
    @Environment(AppModel.self) private var model
    @State private var expandedOverride: [String: Bool] = [:]
    @State private var confirmingRemove = false
    @State private var renamingMac = false
    @State private var renameText = ""
    @State private var editingEndpoint = false
    @State private var showingSettings = false
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

    private func isExpanded(_ g: ProjectFolder) -> Bool { expandedOverride[g.id] ?? !g.collapsed }

    /// A friendly reference to a Mac in confirmation copy: its name in quotes, or
    /// "the Mac at <address>" while it's still identified only by an IP.
    private func macReference(_ record: MacRecord) -> String {
        record.isAddressName ? "the Mac at \(record.displayAddress)" : "“\(record.displayName)”"
    }

    private var removeMacTitle: String {
        guard let active = model.activeRecord else { return "Remove this Mac?" }
        return active.isAddressName ? "Remove this Mac?" : "Remove “\(active.displayName)”?"
    }

    private var removeMacMessage: String {
        let active = model.activeRecord
        let first = (active?.isAddressName ?? false)
            ? "This iPhone will be unpaired from the Mac at \(active!.displayAddress) and its notifications will stop."
            : "This iPhone will be unpaired and notifications from this Mac will stop."
        let switchSentence = model.nextMacAfterRemoval.map { " You’ll switch to \(macReference($0))." } ?? ""
        return first + switchSentence + " To add it back, scan its QR code again."
    }

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
        }
    }

    private func projectLink(_ row: SidebarRow, indented: Bool) -> some View {
        NavigationLink(value: row.project.name) {
            ProjectRow(project: row.project,
                       pending: model.pendingRun[row.project.name] != nil)
                .padding(.leading, indented ? 20 : 0)
        }
        .projectRowActions(row.project, removing: $removing, duplicating: $duplicating,
                           newFolderForProject: $newFolderForProject)
    }

    var body: some View {
        List {
            ForEach(model.sidebarItems) { item in
                sidebarRow(item)
            }
        }
        .refreshable { await model.refreshProjects() }
        .navigationTitle("Projects")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ConnectionIndicator(state: model.connection)
            }
            ToolbarItem(placement: .principal) {
                MacSwitcherMenu()
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    NavigationLink(value: NotificationRoute.automations) {
                        Label("Automations", systemImage: "clock.arrow.circlepath")
                    }
                    NavigationLink {
                        StatsScreen()
                    } label: {
                        Label("Stats", systemImage: "chart.bar")
                    }
                    Button { showingSettings = true } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                    Divider()
                    Button { folderNameText = ""; creatingFolder = true } label: {
                        Label("New Folder…", systemImage: "folder.badge.plus")
                    }
                    Button {
                        renameText = model.activeRecord?.displayName ?? ""
                        renamingMac = true
                    } label: {
                        Label("Rename this Mac", systemImage: "pencil")
                    }
                    Button { editingEndpoint = true } label: {
                        Label("Edit Address…", systemImage: "network")
                    }
                    Button(role: .destructive) { confirmingRemove = true } label: {
                        Label("Remove this Mac", systemImage: "trash")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(.primary)
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
            }
        }
        .overlay {
            if model.projects.isEmpty {
                if model.projectsLoaded {
                    ContentUnavailableView("No projects", systemImage: "folder")
                } else if case .failed(let msg) = model.connection {
                    ContentUnavailableView {
                        Label("Can't reach your Mac", systemImage: "wifi.slash")
                    } description: {
                        Text(msg)
                    } actions: {
                        Button("Retry") { model.retryConnection() }
                            .buttonStyle(.borderedProminent)
                    }
                } else {
                    ProjectListSkeleton()
                }
            }
        }
        .animation(.default, value: model.projectsLoaded)
        .alert(removeMacTitle, isPresented: $confirmingRemove) {
            Button("Remove", role: .destructive) { model.removeActiveMac() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(removeMacMessage)
        }
        .alert("Rename Mac", isPresented: $renamingMac) {
            TextField("Mac name", text: $renameText)
            Button("Cancel", role: .cancel) {}
            Button("Save") { model.renameActiveMac(renameText) }
        } message: {
            Text("Leave blank to use the name reported by the Mac.")
        }
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
            Text("This deletes “\(p.label)” and its folder from disk. This can't be undone.")
        }
        .alert(
            "Couldn't complete that",
            isPresented: Binding(get: { model.actionError != nil }, set: { if !$0 { model.actionError = nil } })
        ) {
            Button("OK", role: .cancel) { model.actionError = nil }
        } message: {
            Text(model.actionError ?? "")
        }
        .sheet(item: $duplicating) { p in
            DuplicateOptionsView(project: p, defaults: model.duplicateDefaults) { options in
                model.duplicateProject(p, options: options)
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsSheet()
        }
        .sheet(isPresented: $editingEndpoint) {
            EditEndpointView()
        }
        .alert(
            "Heads up",
            isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })
        ) {
            Button("OK", role: .cancel) { model.notice = nil }
        } message: {
            Text(model.notice ?? "")
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
        .safeAreaInset(edge: .top) {
            if let status = model.recoveryStatus {
                RecoveryBanner(text: status)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.default, value: model.duplicateProgress == nil)
        .animation(.default, value: model.recoveryStatus)
    }
}

private struct NotificationTerminalDestination: View {
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
        .task { model.loadTerminals(projectName) }
    }
}

/// A slim top banner shown while automatic endpoint recovery is finding the Mac
/// on the local network and reconnecting to it.
private struct RecoveryBanner: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            ProgressView().controlSize(.small)
            Text(text)
                .font(.subheadline.weight(.medium))
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal)
        .padding(.bottom, 6)
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

/// A dot + one-word status for the live link to the Mac. The dot carries the
/// color; it pulses while the socket is still connecting.
struct ConnectionIndicator: View {
    let state: LpmClient.State

    private var tint: SwiftUI.Color {
        switch state {
        case .ready: return .green
        case .connecting: return .orange
        case .failed: return .red
        case .idle: return .gray
        }
    }
    private var label: String {
        switch state {
        case .ready: return "live"
        case .connecting: return "connecting"
        case .failed, .idle: return "offline"
        }
    }

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: "circle.fill")
                .font(.system(size: 7))
                .foregroundStyle(tint)
                .symbolEffect(.pulse, isActive: state == .connecting)
            Text(label)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.secondary)
        }
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
    let project: Project
    var pending: Bool = false

    var body: some View {
        HStack {
            Group {
                if pending {
                    ProgressView().controlSize(.mini)
                } else {
                    RunningDot(running: project.running)
                }
            }
            .frame(width: 14)
            Text(project.label)
            Spacer()
            if let s = project.statusEntries.first {
                StatusBadge(value: s.value)
            }
        }
    }
}

/// The green (running) / grey (stopped) status dot, shared across the projects
/// list and the project detail header.
struct RunningDot: View {
    let running: Bool
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(running ? .green : .secondary)
            .frame(width: size, height: size)
    }
}

struct StatusBadge: View {
    let value: String
    var color: SwiftUI.Color {
        switch value {
        case "Waiting": return .orange
        case "Error": return .red
        case "Done": return .green
        default: return .blue
        }
    }
    var body: some View {
        Text(value)
            .font(.caption2).bold()
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(color.opacity(0.15)).foregroundStyle(color)
            .clipShape(Capsule())
    }
}

private final class KeyboardObserver: ObservableObject {
    @Published private(set) var height: CGFloat = 0
    @Published private(set) var duration: Double = 0.25

    private let center: NotificationCenter
    private var observers: [NSObjectProtocol] = []

    init(center: NotificationCenter = .default) {
        self.center = center
        observers = [
            center.addObserver(
                forName: UIResponder.keyboardWillChangeFrameNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.update(from: notification)
            },
            center.addObserver(
                forName: UIResponder.keyboardWillHideNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                self?.update(from: notification, hidden: true)
            }
        ]
    }

    deinit {
        observers.forEach(center.removeObserver)
    }

    private func update(from notification: Notification, hidden: Bool = false) {
        duration = (notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?
            .doubleValue ?? 0.25

        guard !hidden,
              let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else {
            height = 0
            return
        }

        height = keyboardOverlap(for: frame)
    }

    private func keyboardOverlap(for screenFrame: CGRect) -> CGFloat {
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: { $0.isKeyWindow }) else {
            return max(0, UIScreen.main.bounds.maxY - screenFrame.minY)
        }

        let frame = window.convert(screenFrame, from: nil)
        return max(0, window.bounds.maxY - frame.minY - window.safeAreaInsets.bottom)
    }
}

/// A single terminal: xterm.js (in a WKWebView) renders output the client streams
/// in and posts keystrokes back — the same emulator the desktop uses, so rendering
/// matches and scrollback works. The nav bar floats translucently over the top.
struct TerminalScreen: View {
    @Environment(AppModel.self) private var model
    let term: TerminalInfo
    let project: Project
    @StateObject private var keyboard = KeyboardObserver()
    // Flips when the first screen snapshot renders, hiding the loading spinner.
    @State private var hasContent = false
    // A terminal spawned by running an action from this screen — pushed on top.
    @State private var switched: TerminalInfo?
    // Phone-local terminal preferences (Settings → Terminal).
    @AppStorage(TerminalPrefs.fontSizeKey) private var fontSize = TerminalPrefs.defaultFontSize
    @AppStorage(TerminalPrefs.themeKey) private var themeRaw = TerminalPrefs.defaultTheme.rawValue

    private var theme: TerminalTheme { TerminalPrefs.theme(themeRaw) }
    private var liveProject: Project { model.projects.first(where: { $0.name == term.project }) ?? project }

    var body: some View {
        // A terminal is shown live in exactly one place at a time. When the
        // desktop (or another phone) owns it, show a "take control" placeholder
        // instead of a second, mis-sized copy — but keep the web view MOUNTED
        // underneath so this phone stays subscribed (a presenter / candidate
        // owner) and takes over instantly on claim.
        let controlled = model.isControlled(term.id)
        // The terminal sits WITHIN the safe area (below the nav bar), so its top
        // rows aren't hidden under the title; the composer sits below it and rides
        // above the keyboard when it opens.
        return VStack(spacing: 0) {
            ZStack {
                WebTerminalView(term: term, onFirstContent: {
                    withAnimation(.easeOut(duration: 0.2)) { hasContent = true }
                }, fontSize: fontSize, theme: theme)
                    .environment(model)
                if controlled && !hasContent {
                    TerminalLoadingView(background: theme.backgroundColor)
                }
                if !controlled {
                    ControlHandoffView(ownerLabel: model.controlOwnerLabel(term.id),
                                       background: theme.backgroundColor) {
                        model.claimControl(term.id)
                    }
                }
                // Without this the terminal just freezes silently while the link
                // is down — keystrokes and scroll are live traffic, dropped by
                // design, so the user needs to see WHY nothing responds.
                if model.connection != .ready {
                    TerminalConnectionBanner(state: model.connection) {
                        model.retryConnection()
                    }
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .animation(.easeOut(duration: 0.2), value: model.connection == .ready)
            if controlled {
                TerminalComposer(store: model.composerStore(for: term.id, project: term.project, label: term.label),
                                 terminalBackground: theme.backgroundColor)
                    .environment(model)
            }
        }
            .padding(.bottom, keyboard.height)
            .background(theme.backgroundColor.ignoresSafeArea(.all, edges: .all))
            .animation(.easeOut(duration: keyboard.duration), value: keyboard.height)
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .navigationTitle(term.label)
            .navigationBarTitleDisplayMode(.inline)
            .projectMenuToolbar(project: liveProject, onSpawnedTerminal: { t in
                // The new terminal is owned by the desktop that opened it; claim it
                // for this phone before pushing so the pushed screen renders live
                // instead of a "take control" placeholder.
                model.claimControl(t.id)
                switched = t
            })
            .navigationDestination(item: $switched) { TerminalScreen(term: $0, project: liveProject) }
            // Fallback: never leave the spinner up if no snapshot ever arrives
            // (e.g. the link drops mid-open).
            .task {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                withAnimation { hasContent = true }
            }
            // Solid bar matching the terminal ground, scoped to this screen — the
            // terminal sits below it (safe area), so the bar reads as one continuous
            // surface with the terminal instead of letting the light background show
            // through. `.dark` keeps title/back white (every theme has a dark bg).
            .toolbarBackground(theme.backgroundColor, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

/// Floating capsule over the terminal while the Mac link is down. Keystrokes and
/// scroll are dropped (not queued) during a gap, so this is the only signal that
/// the frozen screen is a connection problem and not a hung app.
struct TerminalConnectionBanner: View {
    let state: LpmClient.State
    let onRetry: () -> Void

    private var reconnecting: Bool {
        if case .connecting = state { return true }
        return false
    }

    var body: some View {
        HStack(spacing: 8) {
            if reconnecting {
                ProgressView()
                    .controlSize(.small)
                    .tint(.white)
                Text("Reconnecting…")
            } else {
                Image(systemName: "wifi.slash")
                Text("Offline")
                Button("Retry", action: onRetry)
                    .fontWeight(.semibold)
            }
        }
        .font(.footnote)
        .foregroundStyle(.white)
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(.black.opacity(0.6), in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.15)))
        .environment(\.colorScheme, .dark)
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
