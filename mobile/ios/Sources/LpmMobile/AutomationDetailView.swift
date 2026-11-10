import SwiftUI

/// One automation's own page: what state it is in right now, when it next runs,
/// and every run it has made. The one thing you came to do — start or stop it —
/// sits in a pinned bar, so it stays in reach however far the history scrolls.
struct AutomationDetailView: View {
    @Environment(AppModel.self) private var model
    let project: String
    let jobId: String

    /// How many runs the history shows before it asks to be expanded.
    private static let historyPreview = 8

    @State private var editor: AutomationEditorContext?
    @State private var showAllRuns = false
    /// The run still going, open on its own page. Pushed from the list rather than
    /// from its section, which goes when the run ends: the page stays and shows the
    /// run it landed in.
    @State private var liveRunOpen = false
    // Settings stay folded away so the runs — the reason you opened the page —
    // start near the top. Collapsed, each group still shows the one fact you'd
    // open it for. The choice is the reader's, and it sticks across automations.
    @AppStorage("automation.scheduleOpen") private var scheduleOpen = false
    @AppStorage("automation.setupOpen") private var setupOpen = false

    private var key: String { model.automationKey(project, jobId) }
    private var job: AutomationJob? { automationMatching(model.automations, project, jobId) }
    private var pending: Bool { model.automationPending.contains(key) }
    private var threads: [AutomationThread] {
        automationThreads(model.automationHistory[key] ?? []).sorted { $0.tail.at > $1.tail.at }
    }

    var body: some View {
        List {
            if let job {
                header(job)
                // The questions the automation is waiting on, wherever they wait;
                // the run still going shows its own.
                ForEach(job.asksOutsideRun) { ask in
                    Section {
                        AutomationAskCard(ask: ask, project: ask.project, jobId: job.id, framed: false)
                            .id(ask.id)
                    }
                }
                Section {
                    schedule(job)
                    setup(job)
                }
                if job.running { liveOutput(job) }
            } else if model.automationsLoaded {
                Section {
                    ContentUnavailableView("Automation not found",
                                           systemImage: "clock.badge.questionmark",
                                           description: Text("It may have been removed or renamed."))
                }
            }
            history
        }
        .navigationDestination(isPresented: $liveRunOpen) {
            AutomationConversationView(project: project, jobId: jobId,
                                       rootAt: AutomationConversationView.liveRun)
        }
        .navigationTitle(job?.displayName ?? "Automation")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let job { runBar(job) }
        }
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
        .refreshable {
            await model.refreshAutomations()
            model.loadAutomationHistory(project: project, jobId: jobId)
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
        .alert("Couldn't update automation", isPresented: errorPresented) {
            Button("OK", role: .cancel) { model.automationError = nil }
        } message: {
            Text(model.automationError ?? "")
        }
    }

    // MARK: Sections

    /// The name is already in the nav bar and stays there while the page scrolls,
    /// so the header spends its one row on what the bar can't say: where the job
    /// runs, and what it is doing right now.
    private func header(_ job: AutomationJob) -> some View {
        Section {
            HStack(spacing: 10) {
                Text(job.emoji.isEmpty ? "⏱️" : job.emoji)
                    .font(.title3)
                Text(automationScopeText(job))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                Spacer(minLength: 8)
                AutomationStatusPill(job: job)
                    .layoutPriority(1)
            }

            if !job.valid {
                Label(job.error.isEmpty ? "This automation can't run." : job.error,
                      systemImage: "exclamationmark.triangle.fill")
                    .font(.subheadline)
                    .foregroundStyle(.red)
            }
        }
    }

    private func schedule(_ job: AutomationJob) -> some View {
        DisclosureGroup(isExpanded: $scheduleOpen) {
            if job.hasOnOffSwitch {
                Toggle("Automation on", isOn: Binding(
                    get: { job.enabled },
                    set: { enabled in
                        Haptics.tap()
                        model.setAutomationEnabled(job, enabled: enabled)
                    }
                ))
                .disabled(!job.valid || pending)
            }
            if job.valid, job.enabled, let next = job.nextFireAt {
                LabeledContent("Next run", value: automationClockText(next))
            }
            if let last = job.lastRunAt {
                AutomationTimeRow(title: "Last run",
                                  value: automationClockText(last),
                                  detail: lastRunDetail(job, at: last),
                                  tint: automationResultColor(job.lastResult))
            }
        } label: {
            AutomationGroupLabel(title: "Schedule", value: automationScheduleText(job))
        }
    }

    private func lastRunDetail(_ job: AutomationJob, at: Int) -> String {
        let when = automationDateText(at)
        guard !job.lastResult.isEmpty else { return when }
        return "\(automationResultLabel(job.lastResult)) · \(when)"
    }

    @ViewBuilder
    private func setup(_ job: AutomationJob) -> some View {
        let showsAgent = job.runKind == "prompt"
        let showsTargets = job.runsIn.count > 1
        let runsOn = AutomationMachines.label(job, choices: model.automationMachines)
        if !job.summary.isEmpty || showsAgent || job.duplicate || showsTargets || runsOn != nil {
            DisclosureGroup(isExpanded: $setupOpen) {
                if !job.summary.isEmpty {
                    Text(job.summary)
                        .font(job.runKind == "cmd"
                              ? .system(.subheadline, design: .monospaced) : .subheadline)
                        .textSelection(.enabled)
                }
                if showsAgent {
                    LabeledContent("Agent", value: automationAgentText(job))
                }
                if job.duplicate {
                    Label("Works in a fresh copy of the project", systemImage: "doc.on.doc")
                        .font(.subheadline)
                }
                if showsTargets {
                    LabeledContent("Runs in", value: job.runsIn.joined(separator: ", "))
                }
                if let runsOn {
                    LabeledContent("Runs on", value: runsOn)
                }
            } label: {
                // Open, the full prompt sits right below — the stand-in would only
                // repeat its first line. The schedule's label has no such twin.
                AutomationGroupLabel(title: "Does",
                                     value: setupOpen ? "" : automationFirstLine(job.summary) ?? "")
            }
        }
    }

    private func liveOutput(_ job: AutomationJob) -> some View {
        Section {
            if let place = automationRunPlaceText(job) {
                Text(place)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            // Above the output, which grows while the run streams, so it stays put.
            Button {
                liveRunOpen = true
            } label: {
                HStack {
                    Text("Open the run").foregroundStyle(.primary)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.tertiary)
                }
            }
            AutomationLiveTail(text: model.automationLiveOutput[key]?.text ?? "")
            ForEach(job.runningRunAsks) { ask in
                AutomationAskCard(ask: ask, project: ask.project, jobId: job.id, framed: false)
                    .id(ask.id)
            }
            if !job.takeOverIn.isEmpty {
                Button("Take over in terminal") { model.takeOverAutomation(job) }
                    .disabled(pending)
            }
        } header: {
            Text("Live output")
        } footer: {
            if !job.takeOverIn.isEmpty {
                Text("Taking over stops this run and carries it on in a terminal.")
            }
        }
    }

    @ViewBuilder
    private var history: some View {
        let all = threads
        let shown = showAllRuns ? all : Array(all.prefix(Self.historyPreview))
        Section {
            if model.automationHistoryLoading.contains(key), model.automationHistory[key] == nil {
                HStack { Spacer(); ProgressView(); Spacer() }
            } else if all.isEmpty {
                Text("No runs yet. Start one to see what it does.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(shown) { thread in
                    NavigationLink {
                        AutomationConversationView(project: project, jobId: jobId, rootAt: thread.root.at)
                    } label: {
                        // An agent answer opens with its point, so its first line
                        // previews well; a command's log opens with boilerplate.
                        AutomationHistoryRow(thread: thread,
                                             previews: job?.runKind == "prompt",
                                             unread: automationThreadUnread(thread))
                    }
                }
                if all.count > shown.count {
                    Button("Show all \(all.count) runs") {
                        withAnimation { showAllRuns = true }
                    }
                    .font(.subheadline)
                }
            }
        } header: {
            HStack {
                Text("Run history")
                Spacer()
                if let job, job.unread > 0 {
                    Button("Mark read") { model.markAutomationSeen(job) }
                        .font(.caption)
                        .textCase(nil)
                }
                if !all.isEmpty { Text(all.count.formatted()) }
            }
        }
    }

    // MARK: Run bar

    private func runBar(_ job: AutomationJob) -> some View {
        Button {
            Haptics.tap()
            if job.running {
                model.stopAutomation(job)
            } else if job.enabled {
                model.runAutomation(job)
            } else {
                model.setAutomationEnabled(job, enabled: true)
            }
        } label: {
            HStack(spacing: 8) {
                if pending {
                    ProgressView().controlSize(.small).tint(.white)
                } else {
                    Image(systemName: job.running ? "stop.fill" : job.enabled ? "play.fill" : "power")
                }
                Text(runTitle(job)).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .tint(job.running ? .red : .accentColor)
        // A question waiting for its answer holds the next run back.
        .disabled(pending || (job.enabled && !job.valid) || (job.held && !job.running && job.enabled))
        .padding(.horizontal, 16)
        .padding(.top, 8)
        .padding(.bottom, 6)
        .background(.bar)
    }

    private func runTitle(_ job: AutomationJob) -> String {
        if job.running {
            return job.runningCount > 1 ? "Stop \(job.runningCount) runs" : "Stop run"
        }
        if !job.enabled { return "Turn on" }
        return job.runsIn.count > 1 ? "Run in \(job.runsIn.count) projects" : "Run now"
    }

    private var errorPresented: Binding<Bool> {
        Binding(
            get: { model.automationError != nil },
            set: { if !$0 { model.automationError = nil } }
        )
    }
}
