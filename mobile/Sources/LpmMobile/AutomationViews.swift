import SwiftUI

struct AutomationsView: View {
    @Environment(AppModel.self) private var model
    @State private var editor: AutomationEditorContext?

    /// One flat feed rather than a directory: everything unread first, newest
    /// activity first inside each half. Which projects an automation runs in
    /// rides on its own row, so the list never has to be cut into sections by
    /// project.
    private var sorted: [AutomationJob] { automationsSortedForList(model.automations) }
    private var unread: [AutomationJob] { sorted.filter { $0.unread > 0 } }
    private var read: [AutomationJob] { sorted.filter { $0.unread == 0 } }

    var body: some View {
        List {
            if !unread.isEmpty {
                Section("New") {
                    ForEach(unread, id: \.key) { row($0) }
                }
            }
            Section {
                ForEach(read, id: \.key) { row($0) }
            } header: {
                if !unread.isEmpty && !read.isEmpty { Text("Earlier") }
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
            ToolbarItem(placement: .topBarLeading) {
                if !unread.isEmpty {
                    Button("Mark all read") {
                        Haptics.tap()
                        model.markAllAutomationsSeen()
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

    private func row(_ job: AutomationJob) -> some View {
        NavigationLink {
            AutomationDetailView(project: job.runProject, jobId: job.id)
        } label: {
            AutomationRow(job: job, scope: automationScopeLabel(job, projectCount: model.projects.count))
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
                    Label(job.enabled ? "Pause" : "Resume",
                          systemImage: job.enabled ? "pause.fill" : "clock.arrow.circlepath")
                }
                .tint(job.enabled ? .orange : .green)
            }
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
                    Text(scope)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.secondary.opacity(0.14), in: Capsule())
                    if job.source == "repo" {
                        Text("in repo")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }

                HStack(spacing: 5) {
                    Circle()
                        .fill(automationStatusColor(job))
                        .frame(width: 6, height: 6)
                    Text(statusText)
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
