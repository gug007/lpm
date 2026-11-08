import SwiftUI

/// A service's recent pane output while the service runs, or after its command
/// ended while its pane is still open — the mobile counterpart of the desktop's
/// service pane. The Mac pushes it as it changes (`serviceLogsWatch`); one that
/// predates that is polled every 3s instead. The toolbar carries the service's
/// Start/Stop toggle, or Restart once it ended. Error lines are red, and under a
/// crashed service's log Fix with … rows hand the crash to an agent in a new tab.
struct ServiceLogsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    let service: Service
    /// Told about the tab a fix opens.
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    @State private var detent: PresentationDetent
    @State private var gauntlet = ActionRunGauntlet()
    /// The fixing option whose inputs or confirmation are up.
    @State private var fixing: LaunchpadOption?

    /// A service that `crashed` opens tall, its log and the ways to fix it both in view.
    init(project: String, service: Service, crashed: Bool = false,
         onSpawnedTerminal: ((TerminalInfo) -> Void)? = nil) {
        self.project = project
        self.service = service
        self.onSpawnedTerminal = onSpawnedTerminal
        _detent = State(initialValue: crashed ? .large : .medium)
    }

    private var live: Project? { model.projects.first(where: { $0.name == project }) }
    private var running: Bool { live?.liveServiceNames.contains(service.name) ?? false }
    private var ended: Service? { live?.endedServices[service.name] }
    private var pending: Bool { model.pendingServiceToggle[project]?[service.name] != nil }
    // Pane index from the last `services` discovery; nil until it loads (or while
    // the service is stopped), so the poll loop keeps re-discovering.
    private var discovered: ServiceInfo? { model.services[project]?.first(where: { $0.name == service.name }) }
    private var paneIndex: Int? { discovered?.paneIndex }
    private var crashed: Bool { ended?.crashed ?? false }
    private var key: String? { paneIndex.map { model.serviceLogsKey(project, $0) } }
    private var text: String { key.flatMap { model.serviceLogsResult[$0] } ?? "" }
    private var feed: Feed {
        Feed(hasPane: running || ended != nil, paneIndex: paneIndex, ready: model.connection == .ready)
    }
    private var fetchError: String? { key.flatMap { model.serviceLogsError[$0] } }

    var body: some View {
        NavigationStack {
            FollowingScrollView(follow: Follow(text: text, crashed: crashed, agents: model.agentLaunch.options?.count)) {
                VStack(alignment: .leading, spacing: 0) {
                    if let fetchError, text.isEmpty {
                        Text(fetchError)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    } else if text.isEmpty {
                        HStack(spacing: 8) {
                            if running { ProgressView().controlSize(.small) }
                            Text(running ? "Waiting for output…" : ended != nil ? "No output." : "This service isn't running.")
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding()
                    } else {
                        Text(ServiceLogText.tinted(text))
                            .font(.system(.caption, design: .monospaced))
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                    }
                    if crashed {
                        ServiceCrashPanel(project: project, log: text, onFix: fix)
                    }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { statusBar }
            .navigationTitle(service.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if pending {
                        ProgressView().controlSize(.small)
                    } else if ended != nil {
                        Button("Restart") { model.restartService(project, service: service.name) }
                    } else if running {
                        Button("Stop", role: .destructive) { model.toggleService(project, service: service.name) }
                    } else {
                        Button("Start") { model.toggleService(project, service: service.name) }
                    }
                }
            }
        }
        .actionRunGauntlet($gauntlet) { action, values in
            if let fixing { run(fixing, action, values) }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationBackground(Color(.systemBackground))
        .preferredColorScheme(.dark)
        // Restarts as the service starts or stops, its pane is found, or the link
        // comes back — the Mac forgets a dropped connection's watch.
        .task(id: feed) {
            guard feed.hasPane, feed.ready else { return }
            guard let paneIndex = feed.paneIndex else {
                while !Task.isCancelled {
                    model.loadServices(project)
                    try? await Task.sleep(nanoseconds: 3_000_000_000)
                }
                return
            }
            if model.canWatchServiceLogs {
                model.watchServiceLogs(project, paneIndex: paneIndex, true)
                while !Task.isCancelled { try? await Task.sleep(nanoseconds: 3_600_000_000_000) }
                model.watchServiceLogs(project, paneIndex: paneIndex, false)
                return
            }
            while !Task.isCancelled {
                model.fetchServiceLogs(project, paneIndex: paneIndex)
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
        .onDisappear {
            if let key { model.consumeServiceLogs(key) }
        }
    }

    private func fix(_ option: LaunchpadOption) {
        fixing = option
        if let action = option.action, gauntlet.begin(action) { return }
        run(option, option.action, [:])
    }

    /// Start the agent with how the service crashed as its first prompt.
    private func run(_ option: LaunchpadOption, _ action: Action?, _ values: [String: String]) {
        let prompt = ServiceCrashPrompt.text(service: service.name, cmd: discovered?.cmd ?? "",
                                             exitCode: ended?.exitCode, log: text)
        let spawned = onSpawnedTerminal
        dismiss()
        model.startFix(project, option: option, action: action, values: values, prompt: prompt) { spawned?($0) }
    }

    /// What, landing, takes the reader to the end: new output, and the crash
    /// panel as it and its rows come in.
    private struct Follow: Equatable {
        let text: String
        let crashed: Bool
        let agents: Int?
    }

    private struct Feed: Equatable {
        let hasPane: Bool
        let paneIndex: Int?
        let ready: Bool
    }

    private var statusBar: some View {
        HStack(spacing: 8) {
            Circle().fill(statusColor).frame(width: 8, height: 8)
            Text(statusText).font(.subheadline.weight(.medium)).lineLimit(1)
            if service.port > 0 {
                Text(":\(String(service.port))")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            if pending { ProgressView().controlSize(.small) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private var statusColor: Color {
        if pending { return .blue }
        if let ended { return ended.crashed ? .red : Color(.systemGray3) }
        return running ? .green : Color(.systemGray3)
    }
    private var statusText: String {
        if pending { return running ? "Stopping…" : "Starting…" }
        if let ended { return ended.exitText.prefix(1).uppercased() + ended.exitText.dropFirst() }
        return running ? "Running" : "Stopped"
    }
}
