import SwiftUI

struct AutomationsView: View {
    @Environment(AppModel.self) private var model
    /// A project's Automations page, as on the desktop: only the jobs that run in
    /// it, and a new job starts in it. nil = every job.
    var project: String? = nil
    @State private var editor: AutomationEditorContext?
    @State private var filter: AutomationListFilter = .all

    private var shown: [AutomationJob] {
        guard let project else { return model.automations }
        return model.automations.filter { $0.runTargets.contains(project) }
    }

    var body: some View {
        let list = AutomationListSnapshot(shown, picked: filter)
        List {
            if list.waitingCount > 0 || list.failedCount > 0 {
                Section {
                    filterPicker(list)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }
            }
            if !list.listedUnread.isEmpty {
                Section("New") {
                    ForEach(list.listedUnread, id: \.key) { row($0) }
                }
            }
            Section {
                ForEach(list.listedRead, id: \.key) { row($0) }
            } header: {
                if !list.listedUnread.isEmpty && !list.listedRead.isEmpty { Text("Earlier") }
            }
        }
        .animation(.default, value: list.active)
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
            ToolbarItem(placement: .topBarLeading) {
                if !list.unread.isEmpty {
                    Button("Mark all read") {
                        Haptics.tap()
                        markAllRead(list.unread)
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

    private func filterPicker(_ list: AutomationListSnapshot) -> some View {
        Picker("Show", selection: Binding(
            get: { list.active },
            set: { next in
                Haptics.tap()
                withAnimation { filter = next }
            }
        )) {
            Text("All \(list.sorted.count)").tag(AutomationListFilter.all)
            if list.waitingCount > 0 {
                Text("Needs you \(list.waitingCount)").tag(AutomationListFilter.needsYou)
            }
            if list.failedCount > 0 {
                Text("Failed \(list.failedCount)").tag(AutomationListFilter.failed)
            }
        }
        .pickerStyle(.segmented)
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

    private func markAllRead(_ unread: [AutomationJob]) {
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
    @Environment(AppModel.self) private var model
    let job: AutomationJob
    /// Which projects the automation runs in — the list is flat, so the row has
    /// to say so itself.
    let scope: String

    private var unread: Bool { job.unread > 0 }

    var body: some View {
        let chip = AutomationRowChip(job)
        HStack(spacing: 10) {
            Circle()
                .fill(unread && chip == nil ? Color.accentColor : Color.clear)
                .frame(width: 8, height: 8)

            Text(job.emoji.isEmpty ? "⏱️" : job.emoji)
                .font(.title3)
                .frame(width: 28)
                .opacity(job.enabled ? 1 : 0.6)

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(job.displayName)
                        .font(.body.weight(unread ? .semibold : .medium))
                        .foregroundStyle(job.enabled ? Color.primary : Color.secondary)
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

                if let chip {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(chip.label)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(chip.color)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 1)
                            .background(chip.color.opacity(0.15), in: Capsule())
                            .fixedSize()
                        Text(chip.text)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(2)
                    }
                } else {
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        Circle()
                            .fill(job.running ? Color.green : automationStatusColor(job))
                            .frame(width: 6, height: 6)
                            .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 4 }
                        Text(statusText)
                            .font(.caption)
                            .foregroundStyle(job.enabled ? Color.secondary : Color(.tertiaryLabel))
                            .lineLimit(1)
                    }
                }
            }

            Spacer(minLength: 4)

            if job.running {
                ProgressView().controlSize(.small)
            } else if chip?.answering == true {
                Text("Answer")
                    .modifier(RowCapsule())
                    .accessibilityHidden(true)
            } else if automationLastRunFailed(job) {
                Button {
                    Haptics.tap()
                    model.runAutomation(job)
                } label: {
                    Label("Retry", systemImage: "arrow.clockwise")
                        .modifier(RowCapsule())
                }
                .buttonStyle(.borderless)
                .tint(.primary)
            }
        }
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

/// The outlined capsule a row's own button sits in.
private struct RowCapsule: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .overlay(Capsule().strokeBorder(Color(.separator)))
    }
}

/// The list as one pass of `body` works it out: sorted once, then counted and
/// filtered by the desktop's All / Needs you / Failed filter. Everything unread
/// comes first, newest activity first inside each half, and a filter with
/// nothing left in it lets go.
private struct AutomationListSnapshot {
    let sorted: [AutomationJob]
    let unread: [AutomationJob]
    let waitingCount: Int
    let failedCount: Int
    let active: AutomationListFilter
    let listedUnread: [AutomationJob]
    let listedRead: [AutomationJob]

    init(_ jobs: [AutomationJob], picked: AutomationListFilter) {
        sorted = automationsSortedForList(jobs)
        unread = sorted.filter { $0.unread > 0 }
        waitingCount = sorted.lazy.filter(automationNeedsAnswer).count
        failedCount = sorted.lazy.filter(automationLastRunFailed).count
        let pickedCount = picked == .needsYou ? waitingCount : failedCount
        active = picked == .all || pickedCount == 0 ? .all : picked
        let listed = sorted.filter(active.keeps)
        listedUnread = listed.filter { $0.unread > 0 }
        listedRead = listed.filter { $0.unread == 0 }
    }
}
