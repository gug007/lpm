import SwiftUI

/// Live output for a headless background action run, polled from the Mac every 2s
/// while it runs (mirrors AutomationDetailView's live-output loop). Shows the
/// streaming log, a status pill, and a Stop control — the mobile counterpart of the
/// desktop's background-run toast.
struct BackgroundRunSheet: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    let run: BackgroundRunInfo

    private var snapshot: ActionBgOutput? { model.backgroundRuns[run.runId] }
    private var startError: String? { model.backgroundRunErrors[run.runId] }
    // Until the first poll returns (snapshot nil) a just-started run is treated as
    // running so the poll loop kicks in; a rejected start is terminal.
    private var running: Bool { startError == nil && (snapshot?.running ?? true) }
    private var text: String { snapshot?.text ?? "" }

    var body: some View {
        NavigationStack {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        if text.isEmpty {
                            HStack(spacing: 8) {
                                if running { ProgressView().controlSize(.small) }
                                Text(running ? "Waiting for output…" : "No output.")
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
                        Color.clear.frame(height: 1).id("bg-bottom")
                    }
                }
                .onChange(of: text) { _, _ in
                    withAnimation(.easeOut(duration: 0.15)) { proxy.scrollTo("bg-bottom", anchor: .bottom) }
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) { statusBar }
            .navigationTitle(run.label)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if running {
                        Button("Stop", role: .destructive) { model.cancelBackgroundRun(run.runId) }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .preferredColorScheme(.dark)
        .task { model.loadBackgroundRunOutput(project: run.project, runId: run.runId) }
        .task(id: running) {
            guard running else { return }
            while !Task.isCancelled {
                model.loadBackgroundRunOutput(project: run.project, runId: run.runId)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
    }

    private var statusBar: some View {
        HStack(spacing: 8) {
            Circle().fill(statusColor).frame(width: 8, height: 8)
            Text(statusText).font(.subheadline.weight(.medium)).lineLimit(1)
            Spacer(minLength: 8)
            if running { ProgressView().controlSize(.small) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private var statusColor: Color {
        if startError != nil { return .red }
        guard let s = snapshot else { return .blue }
        if s.running { return .blue }
        if s.error == "cancelled" { return .orange }
        return s.success ? .green : .red
    }
    private var statusText: String {
        if let startError { return startError }
        guard let s = snapshot else { return "Starting…" }
        if s.running { return "Running" }
        if s.error == "cancelled" { return "Stopped" }
        if !s.success { return s.error.isEmpty ? "Failed" : s.error }
        return "Done"
    }
}
