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

/// One section of the list: a project's jobs, or the two catch-alls for jobs
/// that don't belong to exactly one project.
private struct AutomationGroup: Identifiable {
    let id: String
    let title: String
    let jobs: [AutomationJob]
}

struct AutomationsView: View {
    @Environment(AppModel.self) private var model
    @State private var editor: AutomationEditorContext?

    /// Jobs grouped by where they run: one project → that project's section;
    /// more than one → "Multiple projects"; none → "No project".
    private var groups: [AutomationGroup] {
        var byProject: [String: [AutomationJob]] = [:]
        var multiple: [AutomationJob] = []
        var standalone: [AutomationJob] = []
        for job in model.automations {
            if job.standalone { standalone.append(job) }
            else if job.runsIn.count == 1 { byProject[job.runsIn[0], default: []].append(job) }
            else { multiple.append(job) }
        }
        let byName = { (a: AutomationJob, b: AutomationJob) in
            a.displayName.localizedCaseInsensitiveCompare(b.displayName) == .orderedAscending
        }
        var out = byProject
            .map { AutomationGroup(id: "project/\($0.key)", title: $0.key, jobs: $0.value.sorted(by: byName)) }
            .sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        if !multiple.isEmpty {
            out.append(AutomationGroup(id: "multi", title: "Multiple projects", jobs: multiple.sorted(by: byName)))
        }
        if !standalone.isEmpty {
            out.append(AutomationGroup(id: "none", title: "No project", jobs: standalone.sorted(by: byName)))
        }
        return out
    }

    var body: some View {
        List {
            ForEach(groups) { group in
                Section(group.title) {
                    ForEach(group.jobs, id: \.key) { job in
                        NavigationLink {
                            AutomationDetailView(project: job.runProject, jobId: job.id)
                        } label: {
                            AutomationRow(job: job)
                        }
                        .contextMenu {
                            Button {
                                editor = .edit(job)
                            } label: {
                                Label("Edit", systemImage: "pencil")
                            }
                        }
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            if job.running {
                                Button(role: .destructive) {
                                    model.stopAutomation(job)
                                } label: {
                                    Label("Stop", systemImage: "stop.fill")
                                }
                            } else {
                                Button {
                                    model.runAutomation(job)
                                } label: {
                                    Label("Run", systemImage: "play.fill")
                                }
                                .tint(.blue)
                            }
                        }
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                model.setAutomationEnabled(job, enabled: !job.enabled)
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
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editor = .create
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New automation")
            }
        }
        .sheet(item: $editor) { context in
            AutomationEditorSheet(context: context)
                .environment(model)
        }
        .refreshable { await model.refreshAutomations() }
        .overlay {
            if !model.automationsLoaded {
                ProgressView("Loading automations…")
            } else if model.automations.isEmpty {
                ContentUnavailableView {
                    Label("No automations", systemImage: "clock.arrow.circlepath")
                } description: {
                    Text("Scheduled tasks that check, duplicate, and run agents on their own.")
                } actions: {
                    Button("New automation") { editor = .create }
                }
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
                    if let tag = automationScopeTag(job) {
                        Text(tag)
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

/// What a row says about its job's reach, when that isn't already its section:
/// no project, or the several it spans. A shared job that runs in one project
/// says nothing extra — the section it sits in already names that project.
private func automationScopeTag(_ job: AutomationJob) -> String? {
    if job.standalone { return "NO PROJECT" }
    if job.runsIn.count > 1 { return "\(job.runsIn.count) PROJECTS" }
    return job.source == "repo" ? "IN REPO" : nil
}

/// Where a job runs, for its own page: the project, the count when it spans
/// several, or the home folder when it belongs to none.
private func automationScopeText(_ job: AutomationJob) -> String {
    if job.standalone { return "No project" }
    if job.runsIn.count > 1 { return "\(job.runsIn.count) projects" }
    return job.runsIn.first ?? ""
}

/// The job a page opened for `project` is about. A shared job is one row over
/// several projects, so it answers to any of them — a page reached from a
/// notification or the Activity feed carries the project that ran, which need
/// not be the one the list addresses it by.
private func automationMatching(_ jobs: [AutomationJob],
                                _ project: String, _ jobId: String) -> AutomationJob? {
    jobs.first { $0.id == jobId && ($0.runTargets.contains(project) || $0.runProject == project) }
}

struct AutomationDetailView: View {
    @Environment(AppModel.self) private var model
    let project: String
    let jobId: String

    @State private var editor: AutomationEditorContext?

    private var key: String { model.automationKey(project, jobId) }
    private var job: AutomationJob? { automationMatching(model.automations, project, jobId) }
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
                            Text(automationScopeText(job)).font(.subheadline).foregroundStyle(.secondary)
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
                        if job.running { model.stopAutomation(job) }
                        else { model.runAutomation(job) }
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
                        set: { model.setAutomationEnabled(job, enabled: $0) }
                    ))
                    .disabled(!job.valid || model.automationPending.contains(key))

                    Button {
                        editor = .edit(job)
                    } label: {
                        Label("Edit job", systemImage: "pencil")
                    }
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
        .toolbar {
            if let job {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        editor = .edit(job)
                    } label: {
                        Image(systemName: "pencil")
                    }
                    .accessibilityLabel("Edit automation")
                }
            }
        }
        .sheet(item: $editor) { context in
            AutomationEditorSheet(context: context)
                .environment(model)
        }
        .task {
            model.loadAutomations()
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
                Text(automationEntryLabel(entry))
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

/// What a finished run is called once its own check has had a say. "Done" alone
/// says the agent exited, not that it did what it was asked.
private func automationEntryLabel(_ entry: AutomationHistoryEntry) -> String {
    let base = automationResultLabel(entry.result)
    guard entry.result == "completed", let verified = entry.verified else { return base }
    return verified ? "\(base) — checks passed" : "\(base) — checks failed"
}

/// "6 hours" / "30 minutes" / "2 days" — a gap sized to the unit it reads best in.
private func intervalParts(_ secs: Int) -> (value: Int, unit: String) {
    if secs > 0, secs % 86400 == 0 { return (secs / 86400, "day") }
    if secs > 0, secs < 3600 { return (max(1, secs / 60), "minute") }
    return (max(1, secs / 3600), "hour")
}

private func pluralized(_ value: Int, _ unit: String) -> String {
    value == 1 ? unit : "\(unit)s"
}

private func automationScheduleText(_ job: AutomationJob) -> String {
    if job.scheduleMode == "interval" {
        let lo = intervalParts(job.everySecs)
        guard job.everyMaxSecs > job.everySecs else {
            return lo.value == 1 ? "Every \(lo.unit)" : "Every \(lo.value) \(pluralized(lo.value, lo.unit))"
        }
        let hi = intervalParts(job.everyMaxSecs)
        if lo.unit == hi.unit {
            return "Every \(lo.value)–\(hi.value) \(pluralized(hi.value, hi.unit))"
        }
        return "Every \(lo.value) \(pluralized(lo.value, lo.unit)) to \(hi.value) \(pluralized(hi.value, hi.unit))"
    }
    let days = automationDayPhrase(job)
    let time = automationTimePhrase(job)
    guard job.times > 1 else { return days.prefix(1).uppercased() + days.dropFirst() + " " + time }
    return "\(job.times) times \(days == "every day" ? "a day" : "on \(days)") \(time)"
}

/// Which days the job runs on: "every day", "Mon, Thu", "2 random weekdays".
private func automationDayPhrase(_ job: AutomationJob) -> String {
    guard job.pickDays > 0 else {
        if job.days.isEmpty { return "every day" }
        return job.days.map { $0.prefix(1).uppercased() + String($0.dropFirst()) }
            .joined(separator: ", ")
    }
    let set = Set(job.days)
    let s = job.pickDays == 1 ? "" : "s"
    let noun: String
    if set == ["mon", "tue", "wed", "thu", "fri"] {
        noun = "weekday\(s)"
    } else if set == ["sat", "sun"] {
        noun = "weekend day\(s)"
    } else {
        noun = "day\(s)"
    }
    return "\(job.pickDays) random \(noun) a week"
}

/// When in the day: "at 09:00", or the window a random time is drawn from.
private func automationTimePhrase(_ job: AutomationJob) -> String {
    let clock = { (minutes: Int) in String(format: "%02d:%02d", minutes / 60, minutes % 60) }
    guard let until = job.untilMinutes else { return "at \(clock(job.atMinutes))" }
    return "between \(clock(job.atMinutes)) and \(clock(until))"
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
    case "skipped-overlap", "skipped-pending-copy", "skipped-capacity", "pending-window": return .orange
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
    case "skipped-capacity": return "Waiting — other automations were running"
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
