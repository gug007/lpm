import SwiftUI
#if canImport(SwiftTerm)
import UIKit
import SwiftTerm
#endif

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
        .onAppear { model.bootstrap() }
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
                model.pair(host: host, port: Int(port) ?? 8765, code: code)
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
                model.pair(host: payload.host, port: payload.port, code: payload.code)
            }
        }
    }
}

struct ProjectsView: View {
    @EnvironmentObject var model: AppModel
    @State private var expandedOverride: [String: Bool] = [:]

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
        .navigationDestination(for: String.self) { name in
            if let p = model.projects.first(where: { $0.name == name }) {
                ProjectDetail(project: p)
            }
        }
        .overlay {
            if model.projects.isEmpty { ContentUnavailableView("No projects", systemImage: "folder") }
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
            Circle()
                .fill(project.running ? .green : .secondary)
                .frame(width: 8, height: 8)
            Text(project.label)
            Spacer()
            if let s = project.statusEntries.first {
                StatusBadge(value: s.value)
            }
        }
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

struct ProjectDetail: View {
    @EnvironmentObject var model: AppModel
    let project: Project

    var body: some View {
        List {
            Section("Project") {
                Button(project.running ? "Stop" : "Start") {
                    project.running ? model.stopProject(project) : model.startProject(project)
                }
            }
            Section("Terminals") {
                let terms = model.terminals[project.name] ?? []
                if terms.isEmpty {
                    Text("No open terminals").foregroundStyle(.secondary)
                } else {
                    ForEach(terms) { t in
                        NavigationLink(t.id) { TerminalScreen(term: t) }
                    }
                }
            }
        }
        .navigationTitle(project.label)
        .onAppear { model.loadTerminals(project.name) }
    }
}

/// A single terminal: SwiftTerm renders output the client streams in, and feeds
/// keystrokes back. The keyboard accessory supplies Ctrl/Esc/Tab/arrows.
struct TerminalScreen: View {
    @EnvironmentObject var model: AppModel
    let term: TerminalInfo

    var body: some View {
        TerminalRepresentable(term: term)
            .environmentObject(model)
            .navigationTitle(term.id)
            .navigationBarTitleDisplayMode(.inline)
            .ignoresSafeArea(.container, edges: .bottom)
    }
}

#if canImport(SwiftTerm)
struct TerminalRepresentable: UIViewRepresentable {
    @EnvironmentObject var model: AppModel
    let term: TerminalInfo

    func makeUIView(context: Context) -> SwiftTerm.TerminalView {
        let view = SwiftTerm.TerminalView()
        // A fixed monospace font makes the phone's column count deterministic and
        // legible; SwiftTerm reports the resulting cols/rows via sizeChanged, which
        // we forward as a PTY resize so the remote app repaints at the phone's size.
        view.font = UIFont.monospacedSystemFont(ofSize: 11, weight: .regular)
        view.terminalDelegate = context.coordinator
        model.subscribe(
            term.id,
            onSeed: { _, _, data in
                // Reset before replaying scrollback so a TUI's absolute-positioned
                // redraws (Claude Code) don't overlap earlier content.
                view.getTerminal().resetToInitialState()
                view.feed(text: data)
            },
            onOutput: { data in view.feed(text: data) }
        )
        return view
    }

    func updateUIView(_ uiView: SwiftTerm.TerminalView, context: Context) {}

    static func dismantleUIView(_ uiView: SwiftTerm.TerminalView, coordinator: Coordinator) {
        coordinator.model?.unsubscribe(coordinator.termId)
    }

    func makeCoordinator() -> Coordinator { Coordinator(model: model, termId: term.id) }

    final class Coordinator: NSObject, TerminalViewDelegate {
        weak var model: AppModel?
        let termId: String
        init(model: AppModel, termId: String) { self.model = model; self.termId = termId }

        // Keystrokes → server. SwiftTerm hands us raw bytes; send UTF-8 verbatim,
        // hex-frame anything else (matches the desktop's write_terminal contract).
        func send(source: TerminalView, data: ArraySlice<UInt8>) {
            let bytes = Array(data)
            let text = String(bytes: bytes, encoding: .utf8) ?? Wire.hexFrame(bytes)
            MainActor.assumeIsolated { model?.input(termId, text) }
        }
        func scrolled(source: TerminalView, position: Double) {}
        func setTerminalTitle(source: TerminalView, title: String) {}
        func requestOpenLink(source: TerminalView, link: String, params: [String: String]) {}
        func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
            // The desktop owns geometry; only nudge when we're the active viewer.
            MainActor.assumeIsolated { model?.resize(termId, cols: newCols, rows: newRows) }
        }
        func clipboardCopy(source: TerminalView, content: Data) {}
        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {}
        func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
    }
}
#else
// Placeholder shown until SwiftTerm is added to the Xcode target (see README).
struct TerminalRepresentable: View {
    let term: TerminalInfo
    var body: some View {
        ContentUnavailableView("Add SwiftTerm", systemImage: "terminal",
                               description: Text("Add the SwiftTerm package to render \(term.id)."))
    }
}
#endif
