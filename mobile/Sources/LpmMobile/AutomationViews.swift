import SwiftUI

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
