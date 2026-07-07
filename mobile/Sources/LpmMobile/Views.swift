import SwiftUI
import UIKit

// Root view: show pairing until we have a credential, then the projects list.
struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if model.paired {
                NavigationStack { ProjectsView() }
            } else {
                PairingView()
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.reconnectIfNeeded() }
        }
        .onAppear {
            model.bootstrap()
            // Warm WebKit now so the first terminal opens without the ~2s cold start.
            TerminalWebPool.prewarm()
        }
    }
}

struct PairingView: View {
    @EnvironmentObject var model: AppModel
    @State private var host = ""
    @State private var port = "8765"
    @State private var code = ""
    @State private var scanning = false

    var body: some View {
        VStack(spacing: 20) {
            Text("Pair with your Mac")
                .font(.title2).bold()
            Text("In lpm on your Mac, open Settings → Mobile devices → Add device, then scan the QR (or enter the code below).")
                .font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            Button {
                scanning = true
            } label: {
                Label("Scan QR code", systemImage: "qrcode.viewfinder")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)

            Text("or enter it manually")
                .font(.caption2).foregroundStyle(.secondary)

            VStack(spacing: 10) {
                TextField("Mac host or Tailnet IP", text: $host)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                TextField("Port", text: $port).keyboardType(.numberPad)
                TextField("Pairing code (e.g. AB12-CD34)", text: $code)
                    .textInputAutocapitalization(.characters)
            }
            .textFieldStyle(.roundedBorder)

            Button("Pair") {
                model.pair(hosts: [host], port: Int(port) ?? 8765, code: code)
            }
            .buttonStyle(.bordered)
            .disabled(host.isEmpty || code.isEmpty)

            if case .failed(let err) = model.connection {
                Text(err).font(.caption).foregroundStyle(.red)
            }
        }
        .padding()
        .sheet(isPresented: $scanning) {
            QRScannerView { payload in
                host = payload.host
                port = String(payload.port)
                code = payload.code
                model.pair(hosts: payload.hosts, port: payload.port, code: payload.code)
            }
        }
    }
}

struct ProjectsView: View {
    @EnvironmentObject var model: AppModel
    @State private var expandedOverride: [String: Bool] = [:]
    @State private var confirmingLogout = false

    private func isExpanded(_ g: ProjectFolder) -> Bool { expandedOverride[g.id] ?? !g.collapsed }

    var body: some View {
        List {
            ForEach(model.sidebarItems) { item in
                switch item {
                case .project(let p):
                    NavigationLink(value: p.name) { ProjectRow(project: p) }
                case .folder(let g, let members):
                    FolderHeader(name: g.name, count: members.count, expanded: isExpanded(g)) {
                        expandedOverride[g.id] = !isExpanded(g)
                    }
                    if isExpanded(g) {
                        ForEach(members) { p in
                            NavigationLink(value: p.name) {
                                ProjectRow(project: p).padding(.leading, 20)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Projects")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ConnectionIndicator(state: model.connection)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button(role: .destructive) { confirmingLogout = true } label: {
                        Label("Log out", systemImage: "rectangle.portrait.and.arrow.right")
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
                } else if case .failed = model.connection {
                    ContentUnavailableView("Can't reach your Mac", systemImage: "wifi.slash")
                } else {
                    ProgressView().controlSize(.large)
                }
            }
        }
        .confirmationDialog("Log out of this Mac?", isPresented: $confirmingLogout, titleVisibility: .visible) {
            Button("Log out", role: .destructive) { model.logout() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This device will be unpaired. You'll need to scan a new QR code to reconnect.")
        }
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
                Image(systemName: "folder").foregroundStyle(.secondary)
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

    var body: some View {
        HStack {
            RunningDot(running: project.running)
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
                WebTerminalView(term: term)
                    .environmentObject(model)
                if !controlled {
                    ControlHandoffView(ownerLabel: model.controlOwnerLabel(term.id)) {
                        model.claimControl(term.id)
                    }
                }
            }
            if controlled {
                TerminalComposer(termId: term.id, project: term.project, label: term.label)
                    .environmentObject(model)
            }
        }
            .padding(.bottom, keyboard.height)
            .background(SwiftUI.Color.black)
            .animation(.easeOut(duration: keyboard.duration), value: keyboard.height)
            .ignoresSafeArea(.keyboard, edges: .bottom)
            .navigationTitle(term.label)
            .navigationBarTitleDisplayMode(.inline)
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
            VStack(spacing: 16) {
                Image(systemName: "terminal.fill")
                    .font(.system(size: 34))
                    .foregroundColor(.accentColor)
                VStack(spacing: 4) {
                    Text("Active on \(ownerLabel)")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("This terminal is shown and controlled elsewhere to keep it sized correctly.")
                        .font(.footnote)
                        .foregroundColor(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: 280)
                }
                Button {
                    taking = true
                    onTakeControl()
                } label: {
                    Text(taking ? "Taking control…" : "Take control")
                        .font(.subheadline.weight(.medium))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 9)
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .clipShape(Capsule())
                }
                .disabled(taking)
            }
            .padding(24)
        }
        .environment(\.colorScheme, .dark)
    }
}
