import SwiftUI

struct AutomationsView: View {
    @Environment(AppModel.self) private var model
    /// A project's Automations page, as on the desktop: only the jobs that run in
    /// it, and a new job starts in it. nil = every job.
    var project: String? = nil
    @State private var editor: AutomationEditorContext?
    @State private var failedOnly = false

    private var shown: [AutomationJob] {
        guard let project else { return model.automations }
        return model.automations.filter { $0.runTargets.contains(project) }
    }

    /// One flat feed rather than a directory: everything unread first, newest
    /// activity first inside each half. Which projects an automation runs in
    /// rides on its own row, so the list never has to be cut into sections by
    /// project.
    private var sorted: [AutomationJob] { automationsSortedForList(shown) }
    private var unread: [AutomationJob] { sorted.filter { $0.unread > 0 } }
    /// The Failed filter narrows the list to the rows whose last run failed,
    /// and lets go once none are left.
    private var failed: [AutomationJob] { sorted.filter(automationLastRunFailed) }
    private var filtering: Bool { failedOnly && !failed.isEmpty }
    private var listed: [AutomationJob] { filtering ? failed : sorted }
    private var listedUnread: [AutomationJob] { listed.filter { $0.unread > 0 } }
    private var listedRead: [AutomationJob] { listed.filter { $0.unread == 0 } }

    var body: some View {
        List {
            if !listedUnread.isEmpty {
                Section("New") {
                    ForEach(listedUnread, id: \.key) { row($0) }
                }
            }
            Section {
                ForEach(listedRead, id: \.key) { row($0) }
            } header: {
                if !listedUnread.isEmpty && !listedRead.isEmpty { Text("Earlier") }
            }
        }
        .animation(.default, value: filtering)
        .onChange(of: failed.isEmpty) { _, none in if none { failedOnly = false } }
        .navigationTitle("Automations")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    editor = .create(project: project)
                } label: {
                    Image(systemName: "plus")
                }
                .accessibilityLabel("New automation")
            }
            ToolbarItem(placement: .topBarTrailing) {
                if !failed.isEmpty {
                    AutomationFailedToggle(count: failed.count, isOn: filtering) {
                        failedOnly = !filtering
                    }
                }
            }
            ToolbarItem(placement: .topBarLeading) {
                if !unread.isEmpty {
                    Button("Mark all read") {
                        Haptics.tap()
                        markAllRead()
                    }
                    .font(.subheadline)
                }
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
            } else if shown.isEmpty {
                ContentUnavailableView {
                    Label("No automations", systemImage: "clock.arrow.circlepath")
                } description: {
                    Text(project == nil
                         ? "Scheduled tasks that check, duplicate, and run agents on their own."
                         : "Scheduled tasks that run in this project on their own.")
                } actions: {
                    Button("New automation") { editor = .create(project: project) }
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

    /// In a project's page the project is the context: a job that runs only here
    /// needs no scope tag, and a shared one opens on this project's runs. The
    /// computers it runs on follow, once there's more than one to name.
    private func scopeText(_ job: AutomationJob) -> String {
        let scope = project != nil && job.runsIn.count <= 1
            ? "" : automationScopeLabel(job, projectCount: model.projects.count)
        let machines = AutomationMachines.label(job, choices: model.automationMachines)
        return [scope, machines ?? ""].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private func row(_ job: AutomationJob) -> some View {
        NavigationLink {
            AutomationDetailView(project: project ?? job.runProject, jobId: job.id)
        } label: {
            AutomationRow(job: job, scope: scopeText(job))
        }
        .contextMenu {
            Button {
                editor = .edit(job)
            } label: {
                Label("Edit", systemImage: "pencil")
            }
            if job.unread > 0 {
                Button {
                    model.markAutomationSeen(job)
                } label: {
                    Label("Mark read", systemImage: "envelope.open")
                }
            }
            Button {
                model.setAutomationEnabled(job, enabled: !job.enabled)
            } label: {
                Label(job.enabled ? "Turn off" : "Turn on",
                      systemImage: job.enabled ? "pause.fill" : "power")
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            if job.running {
                Button(role: .destructive) {
                    model.stopAutomation(job)
                } label: {
                    Label("Stop", systemImage: "stop.fill")
                }
            } else if job.enabled {
                let retry = automationLastRunFailed(job)
                Button {
                    model.runAutomation(job)
                } label: {
                    Label(retry ? "Retry" : "Run", systemImage: retry ? "arrow.clockwise" : "play.fill")
                }
                .tint(.blue)
            }
        }
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if job.unread > 0 {
                Button {
                    model.markAutomationSeen(job)
                } label: {
                    Label("Read", systemImage: "envelope.open")
                }
                .tint(.blue)
            } else {
                Button {
                    model.setAutomationEnabled(job, enabled: !job.enabled)
                } label: {
                    Label(job.enabled ? "Turn off" : "Turn on",
                          systemImage: job.enabled ? "pause.fill" : "power")
                }
                .tint(job.enabled ? .orange : .green)
            }
        }
    }

    private func markAllRead() {
        if project == nil {
            model.markAllAutomationsSeen()
        } else {
            unread.forEach { model.markAutomationSeen($0) }
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
    /// Which projects the automation runs in — the list is flat, so the row has
    /// to say so itself.
    let scope: String

    private var unread: Bool { job.unread > 0 }

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(unread ? Color.accentColor : Color.clear)
                .frame(width: 8, height: 8)

            Text(job.emoji.isEmpty ? "⏱️" : job.emoji)
                .font(.title3)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(job.displayName)
                        .font(.body.weight(unread ? .semibold : .medium))
                        .lineLimit(1)
                    if !scope.isEmpty {
                        Text(scope)
                            .font(.caption2.weight(.medium))
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.secondary.opacity(0.14), in: Capsule())
                    }
                    if job.source == "repo" {
                        Text("in repo")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }

                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Circle()
                        .fill(automationStatusColor(job))
                        .frame(width: 6, height: 6)
                        .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                    Text(statusText)
                        .font(.caption)
                        .foregroundStyle(job.valid ? Color.secondary : Color.red)
                        .lineLimit(automationLastRunFailed(job) ? 2 : 1)
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

    /// What the row says under the name — with the count of what's waiting in
    /// front of it, since that is why the row is at the top of the list.
    private var statusText: String {
        let status = automationStatusText(job)
        guard unread, !job.running else { return status }
        let count = job.unread > 9 ? "9+" : "\(job.unread)"
        let noun = job.unread == 1 ? "message" : "messages"
        return "\(count) new \(noun) · \(status)"
    }
}
