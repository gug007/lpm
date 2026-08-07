import SwiftUI

/// One run of an automation as a conversation: what it was asked, what it said,
/// and the replies that continued it.
struct AutomationConversationView: View {
    @Environment(AppModel.self) private var model
    let project: String
    let jobId: String
    let rootAt: Int

    @State private var pendingMessage: String?
    @State private var pendingBaseCount = 0

    private var key: String { model.automationKey(project, jobId) }
    private var job: AutomationJob? { automationMatching(model.automations, project, jobId) }
    private var thread: AutomationThread? {
        automationThreads(model.automationHistory[key] ?? []).first { $0.root.at == rootAt }
    }
    private var entries: [AutomationHistoryEntry] { thread?.entries ?? [] }
    private var composerId: String { "automation:\(project):\(jobId):\(rootAt)" }
    private var isSending: Bool {
        pendingMessage != nil || job?.running == true || model.automationPending.contains(key)
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 24) {
                    ForEach(entries) { entry in
                        AutomationMessage(entry: entry, isRoot: entry.at == rootAt,
                                          sourceID: "\(key):\(entry.at)",
                                          title: job?.displayName ?? "Automation",
                                          subtitle: project)
                    }
                    if let pendingMessage {
                        AutomationPendingMessage(message: pendingMessage,
                                                 live: model.automationLiveOutput[key]?.text ?? "")
                    } else if job?.running == true,
                              let live = model.automationLiveOutput[key]?.text,
                              !live.isEmpty {
                        AutomationLiveMessage(text: live)
                    }
                    Color.clear.frame(height: 1).id("automation-bottom")
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .onAppear { scrollToBottom(proxy, animated: false) }
            .onChange(of: entries.count) { _, _ in scrollToBottom(proxy, animated: true) }
            .onChange(of: model.automationLiveOutput[key]?.text) { _, _ in scrollToBottom(proxy, animated: false) }
        }
        // The reader sits under the nav bar, not over the composer: it stays put
        // while the conversation scrolls, and the reply field keeps the thumb zone.
        // The band takes the chat's own background so scrolled text doesn't show
        // through around the capsule.
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.speech.isActive {
                SpeechBar(store: model.speech)
                    .padding(.horizontal, 12)
                    .padding(.top, 4)
                    .padding(.bottom, 8)
                    .background(Color(.systemGroupedBackground))
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.speech.isActive)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if job?.runKind == "prompt" {
                TerminalComposer(
                    store: model.composerStore(for: composerId, project: project,
                                               label: job?.displayName ?? jobId),
                    onSend: sendFollowup,
                    terminalTools: false,
                    disabled: isSending,
                    placeholder: isSending ? "Automation is running…" : "Reply to this run"
                )
            }
        }
        .navigationTitle(job?.displayName ?? "Automation chat")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            model.loadAutomationHistory(project: project, jobId: jobId)
            model.loadAutomationLiveOutput(project: project, jobId: jobId)
        }
        .task(id: job?.running) {
            guard job?.running == true else { return }
            while !Task.isCancelled {
                model.loadAutomationLiveOutput(project: project, jobId: jobId)
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
        .onChange(of: entries.count) { _, count in
            if pendingMessage != nil, count > pendingBaseCount { pendingMessage = nil }
        }
        .onChange(of: model.automationFollowupError[key]) { _, error in
            if error != nil { pendingMessage = nil }
        }
        .alert("Couldn't read aloud", isPresented: speechErrorPresented) {
            Button("OK", role: .cancel) { model.speech.speechError = nil }
        } message: {
            Text(model.speech.speechError ?? "")
        }
        .alert("Couldn't send message", isPresented: followupErrorPresented) {
            Button("OK", role: .cancel) { model.automationFollowupError[key] = nil }
        } message: {
            Text(model.automationFollowupError[key] ?? "")
        }
    }

    private var speechErrorPresented: Binding<Bool> {
        Binding(
            get: { model.speech.speechError != nil },
            set: { if !$0 { model.speech.speechError = nil } }
        )
    }

    private var followupErrorPresented: Binding<Bool> {
        Binding(
            get: { model.automationFollowupError[key] != nil },
            set: { if !$0 { model.automationFollowupError[key] = nil } }
        )
    }

    private func sendFollowup(_ message: String) {
        guard let job, let tail = thread?.tail else { return }
        pendingBaseCount = entries.count
        pendingMessage = message
        model.sendAutomationFollowup(project: project, jobId: jobId, at: tail.at, message: message,
                                     agent: job.agent, model: job.model, effort: job.effort)
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy, animated: Bool) {
        let action = { proxy.scrollTo("automation-bottom", anchor: .bottom) }
        if animated { withAnimation(.easeOut(duration: 0.2), action) }
        else { action() }
    }
}

private struct AutomationMessage: View {
    @Environment(AppModel.self) private var model
    let entry: AutomationHistoryEntry
    let isRoot: Bool
    /// Identifies this message to the reader, so its button knows whether the voice
    /// currently playing is its own.
    let sourceID: String
    let title: String
    let subtitle: String

    private var quiet: Bool { !isRoot && entry.result == "completed" }
    private var isReading: Bool { model.speech.isActive && model.speech.sourceID == sourceID }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if !entry.question.isEmpty {
                HStack {
                    Spacer(minLength: 48)
                    Text(entry.question)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Color(.secondarySystemGroupedBackground))
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .textSelection(.enabled)
                }
            }
            if !quiet { AutomationMessageMeta(entry: entry) }
            if !entry.output.isEmpty {
                MarkdownText(entry.output, speakingBlock: isReading ? model.speech.speakingBlock : nil)
                Button {
                    model.speech.toggle(id: sourceID, title: title, subtitle: subtitle,
                                        markdown: entry.output)
                } label: {
                    Image(systemName: isReading ? "stop.circle" : "speaker.wave.2")
                        .font(.system(size: 14))
                        .foregroundStyle(isReading ? Color.accentColor : Color.secondary)
                        .frame(width: 30, height: 28, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isReading ? "Stop reading" : "Read aloud")
            }
            if quiet { AutomationMessageMeta(entry: entry) }
        }
    }
}

private struct AutomationMessageMeta: View {
    let entry: AutomationHistoryEntry

    var body: some View {
        HStack(spacing: 7) {
            Circle().fill(automationResultColor(entry.result)).frame(width: 7, height: 7)
            Text(automationEntryLabel(entry))
            if let duration = entry.durationSecs { Text(automationDurationText(duration)) }
            if let cost = entry.costUsd { Text(cost.formatted(.currency(code: "USD"))) }
            if entry.compacted { Text("Condensed") }
            Spacer()
            Text(automationClockText(entry.at))
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

private struct AutomationPendingMessage: View {
    let message: String
    let live: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Spacer(minLength: 48)
                Text(message)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text(live.isEmpty ? "Waiting for reply…" : "Replying…")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if !live.isEmpty { AutomationLiveMessage(text: live) }
        }
    }
}

private struct AutomationLiveMessage: View {
    let text: String

    var body: some View {
        ScrollView(.horizontal) {
            Text(text)
                .font(.system(.caption, design: .monospaced))
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
