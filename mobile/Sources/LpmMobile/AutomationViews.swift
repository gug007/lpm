import SwiftUI

private struct AutomationThread: Identifiable {
    let root: AutomationHistoryEntry
    var replies: [AutomationHistoryEntry]

    var id: Int { root.at }
    var entries: [AutomationHistoryEntry] { [root] + replies }
    var tail: AutomationHistoryEntry { replies.last ?? root }
}

private func automationThreads(_ entries: [AutomationHistoryEntry]) -> [AutomationThread] {
    var threads: [AutomationThread] = []
    var bySession: [String: Int] = [:]
    var byAt: [Int: Int] = [:]

    for entry in entries {
        let resumedIndex = entry.resumed.isEmpty ? nil : bySession[entry.resumed]
        let followsIndex = entry.follows.flatMap { byAt[$0] }
        let index: Int
        if let parent = resumedIndex ?? followsIndex {
            threads[parent].replies.append(entry)
            index = parent
        } else {
            threads.append(AutomationThread(root: entry, replies: []))
            index = threads.count - 1
        }
        if !entry.session.isEmpty { bySession[entry.session] = index }
        byAt[entry.at] = index
    }
    return threads
}

struct AutomationsView: View {
    @EnvironmentObject var model: AppModel

    private var groups: [(String, [AutomationJob])] {
        Dictionary(grouping: model.automations, by: \.project)
            .map { ($0.key, $0.value.sorted { $0.displayName.localizedCaseInsensitiveCompare($1.displayName) == .orderedAscending }) }
            .sorted { $0.0.localizedCaseInsensitiveCompare($1.0) == .orderedAscending }
    }

    var body: some View {
        List {
            ForEach(groups, id: \.0) { project, jobs in
                Section(project) {
                    ForEach(jobs, id: \.key) { job in
                        NavigationLink {
                            AutomationDetailView(project: job.project, jobId: job.id)
                        } label: {
                            AutomationRow(job: job)
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            if job.running {
                                Button(role: .destructive) {
                                    model.stopAutomation(project: job.project, jobId: job.id)
                                } label: {
                                    Label("Stop", systemImage: "stop.fill")
                                }
                            } else {
                                Button {
                                    model.runAutomation(project: job.project, jobId: job.id)
                                } label: {
                                    Label("Run", systemImage: "play.fill")
                                }
                                .tint(.blue)
                            }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                model.setAutomationEnabled(project: job.project, jobId: job.id, enabled: !job.enabled)
                            } label: {
                                Label(job.enabled ? "Pause" : "Resume",
                                      systemImage: job.enabled ? "pause.fill" : "clock.arrow.circlepath")
                            }
                            .tint(job.enabled ? .orange : .green)
                        }
                    }
                }
            }
        }
        .navigationTitle("Automations")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.refreshAutomations() }
        .overlay {
            if !model.automationsLoaded {
                ProgressView("Loading automations…")
            } else if model.automations.isEmpty {
                ContentUnavailableView(
                    "No automations",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Create an automation in lpm on your Mac, then manage it here.")
                )
            }
        }
        .task { model.loadAutomations() }
        .alert("Couldn't update automation", isPresented: automationErrorPresented) {
            Button("OK", role: .cancel) { model.automationError = nil }
        } message: {
            Text(model.automationError ?? "")
        }
    }

    private var automationErrorPresented: Binding<Bool> {
        Binding(
            get: { model.automationError != nil },
            set: { if !$0 { model.automationError = nil } }
        )
    }
}

private struct AutomationRow: View {
    let job: AutomationJob

    var body: some View {
        HStack(spacing: 12) {
            Text(job.emoji.isEmpty ? "⏱️" : job.emoji)
                .font(.title3)
                .frame(width: 30)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(job.displayName)
                        .font(.body.weight(.medium))
                        .lineLimit(1)
                    if job.source == "global" {
                        Text("ALL PROJECTS")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 5) {
                    Circle()
                        .fill(automationStatusColor(job))
                        .frame(width: 6, height: 6)
                    Text(automationStatusText(job))
                        .font(.caption)
                        .foregroundStyle(job.valid ? Color.secondary : Color.red)
                        .lineLimit(1)
                }
            }

            Spacer(minLength: 4)

            if job.running {
                ProgressView().controlSize(.small)
            }
        }
        .opacity(job.enabled ? 1 : 0.6)
        .padding(.vertical, 3)
    }
}

struct AutomationDetailView: View {
    @EnvironmentObject var model: AppModel
    let project: String
    let jobId: String

    private var key: String { model.automationKey(project, jobId) }
    private var job: AutomationJob? { model.automations.first { $0.project == project && $0.id == jobId } }
    private var threads: [AutomationThread] {
        automationThreads(model.automationHistory[key] ?? []).sorted { $0.tail.at > $1.tail.at }
    }

    var body: some View {
        List {
            if let job {
                Section {
                    HStack(spacing: 14) {
                        Text(job.emoji.isEmpty ? "⏱️" : job.emoji)
                            .font(.system(size: 32))
                            .frame(width: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(job.displayName).font(.title3.weight(.semibold))
                            Text(project).font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)

                    if !job.valid {
                        Label(job.error.isEmpty ? "This automation can't run." : job.error,
                              systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }

                Section("Controls") {
                    Button {
                        if job.running { model.stopAutomation(project: project, jobId: jobId) }
                        else { model.runAutomation(project: project, jobId: jobId) }
                    } label: {
                        HStack {
                            Label(job.running ? "Stop run" : "Run now",
                                  systemImage: job.running ? "stop.fill" : "play.fill")
                            Spacer()
                            if model.automationPending.contains(key) { ProgressView().controlSize(.small) }
                        }
                    }
                    .foregroundStyle(job.running ? .red : .blue)
                    .disabled(!job.valid || model.automationPending.contains(key))

                    Toggle("Enabled", isOn: Binding(
                        get: { job.enabled },
                        set: { model.setAutomationEnabled(project: project, jobId: jobId, enabled: $0) }
                    ))
                    .disabled(!job.valid || model.automationPending.contains(key))
                }

                Section("Schedule") {
                    LabeledContent("Repeats", value: automationScheduleText(job))
                    if job.enabled, let next = job.nextFireAt {
                        LabeledContent("Next run", value: automationDateText(next))
                    }
                    if let last = job.lastRunAt {
                        LabeledContent("Last run", value: automationDateText(last))
                    }
                    if !job.lastResult.isEmpty {
                        LabeledContent("Last result", value: automationResultLabel(job.lastResult))
                    }
                }

                if job.running {
                    Section("Live output") {
                        if let live = model.automationLiveOutput[key], !live.text.isEmpty {
                            ScrollView(.horizontal) {
                                Text(live.text)
                                    .font(.system(.caption, design: .monospaced))
                                    .textSelection(.enabled)
                            }
                        } else {
                            HStack {
                                ProgressView().controlSize(.small)
                                Text("Waiting for output…").foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }

            Section("Run history") {
                if model.automationHistoryLoading.contains(key), model.automationHistory[key] == nil {
                    HStack { Spacer(); ProgressView(); Spacer() }
                } else if threads.isEmpty {
                    Text("No runs yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(threads) { thread in
                        NavigationLink {
                            AutomationConversationView(project: project, jobId: jobId, rootAt: thread.root.at)
                        } label: {
                            AutomationHistoryRow(thread: thread)
                        }
                    }
                }
            }
        }
        .navigationTitle(job?.displayName ?? "Automation")
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
        .onChange(of: job?.running) { old, new in
            if old == true, new == false {
                model.loadAutomationHistory(project: project, jobId: jobId)
            }
        }
    }
}

private struct AutomationHistoryRow: View {
    let thread: AutomationThread

    private var entry: AutomationHistoryEntry { thread.tail }

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(automationResultColor(entry.result))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 3) {
                Text(automationResultLabel(entry.result))
                    .font(.body.weight(.medium))
                HStack(spacing: 6) {
                    Text(automationDateText(entry.at))
                    if entry.count > 1 { Text("×\(entry.count)") }
                    if !thread.replies.isEmpty {
                        Text("\(thread.replies.count) repl\(thread.replies.count == 1 ? "y" : "ies")")
                    }
                    if !entry.copy.isEmpty { Text(entry.copy) }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

private struct AutomationConversationView: View {
    @EnvironmentObject var model: AppModel
    let project: String
    let jobId: String
    let rootAt: Int

    @State private var pendingMessage: String?
    @State private var pendingBaseCount = 0

    private var key: String { model.automationKey(project, jobId) }
    private var job: AutomationJob? { model.automations.first { $0.project == project && $0.id == jobId } }
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
                        AutomationMessage(entry: entry, isRoot: entry.at == rootAt)
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
        .alert("Couldn't send message", isPresented: followupErrorPresented) {
            Button("OK", role: .cancel) { model.automationFollowupError[key] = nil }
        } message: {
            Text(model.automationFollowupError[key] ?? "")
        }
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
    let entry: AutomationHistoryEntry
    let isRoot: Bool

    private var quiet: Bool { !isRoot && entry.result == "completed" }

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
                Text(entry.output)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .textSelection(.enabled)
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
            Text(automationResultLabel(entry.result))
            if let duration = entry.durationSecs { Text(automationDurationText(duration)) }
            if let cost = entry.costUsd { Text(cost.formatted(.currency(code: "USD"))) }
            if entry.compacted { Text("Condensed") }
            Spacer()
            Text(automationDateText(entry.at))
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

private func automationScheduleText(_ job: AutomationJob) -> String {
    if job.scheduleMode == "interval" {
        let hours = job.everySecs / 3600
        if hours > 0, hours % 24 == 0 {
            let days = hours / 24
            return days == 1 ? "Every day" : "Every \(days) days"
        }
        return hours == 1 ? "Every hour" : "Every \(hours) hours"
    }
    let hour = job.atMinutes / 60
    let minute = job.atMinutes % 60
    let time = String(format: "%02d:%02d", hour, minute)
    if job.days.isEmpty { return "Every day at \(time)" }
    let names = job.days.map { $0.prefix(1).uppercased() + String($0.dropFirst()) }.joined(separator: ", ")
    return "\(names) at \(time)"
}

private func automationStatusText(_ job: AutomationJob) -> String {
    if !job.valid { return job.error.isEmpty ? "Invalid automation" : job.error }
    if job.running { return "Running" }
    if !job.enabled { return "Paused · \(automationScheduleText(job))" }
    if let next = job.nextFireAt { return "\(automationScheduleText(job)) · \(automationDateText(next))" }
    return automationScheduleText(job)
}

private func automationStatusColor(_ job: AutomationJob) -> Color {
    if !job.valid { return .red }
    if job.running { return .blue }
    if !job.enabled { return .secondary }
    return automationResultColor(job.lastResult)
}

private func automationResultColor(_ result: String) -> Color {
    switch result {
    case "completed", "found-work": return .green
    case "error", "timed-out", "context-full": return .red
    case "skipped-overlap", "skipped-pending-copy", "pending-window": return .orange
    default: return .secondary
    }
}

private func automationResultLabel(_ result: String) -> String {
    switch result {
    case "nothing-to-do": return "Nothing to do"
    case "found-work": return "Found work"
    case "completed": return "Done"
    case "error": return "Problem during the run"
    case "canceled": return "Stopped"
    case "timed-out": return "Stopped — ran too long"
    case "context-full": return "Conversation full"
    case "skipped-overlap": return "Skipped — still running"
    case "skipped-pending-copy": return "Waiting for the previous copy"
    case "pending-window": return "Waiting for the app window"
    default: return result.isEmpty ? "No runs yet" : result
    }
}

private func automationDateText(_ seconds: Int) -> String {
    Date(timeIntervalSince1970: TimeInterval(seconds)).formatted(.relative(presentation: .named))
}

private func automationFullDateText(_ seconds: Int) -> String {
    Date(timeIntervalSince1970: TimeInterval(seconds)).formatted(date: .abbreviated, time: .shortened)
}

private func automationDurationText(_ seconds: Int) -> String {
    Duration.seconds(seconds).formatted(.units(allowed: [.hours, .minutes, .seconds], width: .abbreviated))
}
