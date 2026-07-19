import SwiftUI

/// A service's recent pane output, polled from the Mac every 3s while the service
/// runs (tmux pane capture via `serviceLogs` — the mobile counterpart of the
/// desktop's service pane). The toolbar carries the service's Start/Stop toggle.
struct ServiceLogsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let project: String
    let service: Service

    private var live: Project? { model.projects.first(where: { $0.name == project }) }
    private var running: Bool {
        guard let p = live, p.running else { return false }
        return p.services.contains(where: { $0.name == service.name })
    }
    private var pending: Bool { model.pendingServiceToggle[project]?[service.name] != nil }
    // Pane index from the last `services` discovery; nil until it loads (or while
    // the service is stopped), so the poll loop keeps re-discovering.
    private var paneIndex: Int? {
        model.services[project]?.first(where: { $0.name == service.name })?.paneIndex
    }
    private var key: String? { paneIndex.map { model.serviceLogsKey(project, $0) } }
    private var text: String { key.flatMap { model.serviceLogsResult[$0] } ?? "" }
    private var fetchError: String? { key.flatMap { model.serviceLogsError[$0] } }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if let fetchError, text.isEmpty {
                            Text(fetchError)
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                        } else if text.isEmpty {
                            HStack(spacing: 8) {
                                if running { ProgressView().controlSize(.small) }
                                Text(running ? "Waiting for output…" : "This service isn't running.")
                                    .foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                        } else {
                            Text(text)
                                .font(.system(.caption, design: .monospaced))
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding()
                        }
                        Color.clear.frame(height: 1).id("svc-bottom")
                    }
                }
                .onChange(of: text) { _, _ in
                    withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo("svc-bottom", anchor: .bottom) }
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
                    } else if running {
                        Button("Stop", role: .destructive) { model.toggleService(project, service: service.name) }
                    } else {
                        Button("Start") { model.toggleService(project, service: service.name) }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.dark)
        .task(id: running) {
            guard running else { return }
            model.loadServices(project)
            while !Task.isCancelled {
                if let paneIndex {
                    model.fetchServiceLogs(project, paneIndex: paneIndex)
                } else {
                    model.loadServices(project)
                }
                try? await Task.sleep(nanoseconds: 3_000_000_000)
            }
        }
        .onDisappear {
            if let key { model.consumeServiceLogs(key) }
        }
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
        return running ? .green : Color(.systemGray3)
    }
    private var statusText: String {
        if pending { return running ? "Stopping…" : "Starting…" }
        return running ? "Running" : "Stopped"
    }
}
