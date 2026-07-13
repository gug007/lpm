import SwiftUI
import UIKit

// Root view: show pairing until at least one Mac is saved, then the projects list.
struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    // Nav path so a notification tap can deep-link straight to a project's detail.
    @State private var path: [String] = []

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
        }
        // Consume a pending notification-tap target once its project is loaded
        // (a cold-launch tap may land before the projects list has arrived).
        .onChange(of: model.pendingOpenProject) { _, _ in consumePendingOpen() }
        .onChange(of: model.projectsLoaded) { _, _ in consumePendingOpen() }
        .onAppear {
            model.bootstrap()
            // Warm WebKit now so the first terminal opens without the ~2s cold start.
            TerminalWebPool.prewarm()
        }
    }

    private func consumePendingOpen() {
        guard let project = model.pendingOpenProject, !project.isEmpty,
              model.projects.contains(where: { $0.name == project }) else { return }
        path = [project]
        model.pendingOpenProject = nil
    }
}

struct PairingView: View {
    // Non-nil when shown as the "Add a Mac" sheet: adds a Cancel button that
    // returns to the projects list (reconnecting the previously active Mac).
    var onCancel: (() -> Void)? = nil
    @EnvironmentObject var model: AppModel
    @State private var host = ""
    @State private var port = "8765"
    @State private var code = ""
    @State private var scanning = false
    @State private var scannedHosts: [String] = []

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
    @EnvironmentObject var model: AppModel
    @State private var expandedOverride: [String: Bool] = [:]
    @State private var confirmingRemove = false
    @State private var renamingMac = false
    @State private var renameText = ""
    @State private var showingSettings = false
    // The duplicate pending removal-confirmation. Removing deletes its folder from
    // disk, so it always routes through a confirmation dialog.
    @State private var removing: Project?
    // The project whose duplicate-options sheet is open. Duplicating opens the
    // options sheet (count, label, git toggles) rather than firing immediately.
    @State private var duplicating: Project?

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

    var body: some View {
        List {
            ForEach(model.sidebarItems) { item in
                switch item {
                case .project(let row):
                    NavigationLink(value: row.project.name) {
                        ProjectRow(project: row.project,
                                   pending: model.pendingRun[row.project.name] != nil)
                    }
                    .projectRowActions(row.project, removing: $removing, duplicating: $duplicating)
                case .folder(let g, let members):
                    FolderHeader(name: g.name, count: members.filter { !$0.isChild }.count, expanded: isExpanded(g)) {
                        expandedOverride[g.id] = !isExpanded(g)
                    }
                    if isExpanded(g) {
                        ForEach(members) { row in
                            NavigationLink(value: row.project.name) {
                                ProjectRow(project: row.project,
                                           pending: model.pendingRun[row.project.name] != nil)
                                    .padding(.leading, 20)
                            }
                            .projectRowActions(row.project, removing: $removing, duplicating: $duplicating)
                        }
                    }
                }
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
                    Button { showingSettings = true } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
                    Button {
                        renameText = model.activeRecord?.displayName ?? ""
                        renamingMac = true
                    } label: {
                        Label("Rename this Mac", systemImage: "pencil")
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
        .sheet(isPresented: $model.addingMac, onDismiss: { model.cancelAddMac() }) {
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
            Button("Remove", role: .destructive) { model.removeProject(p); removing = nil }
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
        .alert(
            "Heads up",
            isPresented: Binding(get: { model.notice != nil }, set: { if !$0 { model.notice = nil } })
        ) {
            Button("OK", role: .cancel) { model.notice = nil }
        } message: {
            Text(model.notice ?? "")
        }
        .safeAreaInset(edge: .bottom) {
            if let progress = model.duplicateProgress {
                DuplicateProgressBar(progress: progress)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.default, value: model.duplicateProgress == nil)
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
private struct ProjectRowActions: ViewModifier {
    @EnvironmentObject var model: AppModel
    let project: Project
    @Binding var removing: Project?
    @Binding var duplicating: Project?

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
                if !project.isRemote {
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
}

private extension View {
    func projectRowActions(
        _ project: Project,
        removing: Binding<Project?>,
        duplicating: Binding<Project?>
    ) -> some View {
        modifier(ProjectRowActions(project: project, removing: removing, duplicating: duplicating))
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
    @EnvironmentObject var model: AppModel
    let term: TerminalInfo
    @StateObject private var keyboard = KeyboardObserver()
    // Flips when the first screen snapshot renders, hiding the loading spinner.
    @State private var hasContent = false

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
                })
                    .environmentObject(model)
                if controlled && !hasContent {
                    TerminalLoadingView()
                }
                if !controlled {
                    ControlHandoffView(ownerLabel: model.controlOwnerLabel(term.id)) {
                        model.claimControl(term.id)
                    }
                }
            }
            if controlled {
                TerminalComposer(store: model.composerStore(for: term.id, project: term.project, label: term.label))
                    .environmentObject(model)
            }
        }
            .padding(.bottom, keyboard.height)
            .background(SwiftUI.Color.black.ignoresSafeArea(.all, edges: .all))
            .animation(.easeOut(duration: keyboard.duration), value: keyboard.height)
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .navigationTitle(term.label)
            .navigationBarTitleDisplayMode(.inline)
            // Fallback: never leave the spinner up if no snapshot ever arrives
            // (e.g. the link drops mid-open).
            .task {
                try? await Task.sleep(nanoseconds: 5_000_000_000)
                withAnimation { hasContent = true }
            }
            // Solid black bar matching the terminal ground, scoped to this screen —
            // the terminal sits below it (safe area), so the bar reads as one
            // continuous black surface with the terminal instead of letting the
            // light background show through. `.dark` keeps title/back white.
            .toolbarBackground(SwiftUI.Color.black, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
    }
}

/// Shown in place of the terminal when another surface (a desktop window or
/// another phone) currently owns it. "Take control" moves ownership here.
struct ControlHandoffView: View {
    let ownerLabel: String
    let onTakeControl: () -> Void
    @State private var taking = false

    var body: some View {
        ZStack {
            // Match the terminal's black ground so there's no flash behind it.
            SwiftUI.Color.black
            ContentUnavailableView {
                Label("Active on \(ownerLabel)", systemImage: "terminal.fill")
            } description: {
                Text("This terminal is shown and controlled elsewhere.")
            } actions: {
                Button {
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
    }
}
