import SwiftUI

/// The review on the branch's pull request, as the desktop's "@" menu reads it:
/// each verdict, line comment and reply, oldest first, and a way to hand them to
/// any agent the project's New Tab sheet offers, in a new tab.
struct PrReviewSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    let project: Project
    let onSpawnedTerminal: ((TerminalInfo) -> Void)?

    @State private var gauntlet = ActionRunGauntlet()
    @State private var sending: LaunchpadOption?

    private var name: String { project.name }
    private var discussion: PrDiscussion? { model.gitExtras.discussions[name] }
    private var tabs: [LaunchpadTab]? { model.fixTabs(name, actions: project.actions) }

    var body: some View {
        NavigationStack {
            Group {
                if let discussion {
                    list(discussion)
                } else {
                    ContentUnavailableView("No pull request", systemImage: "arrow.triangle.pull",
                                           description: Text("This branch has no pull request on GitHub."))
                }
            }
            .navigationTitle("Review")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() }.fontWeight(.semibold) }
            }
        }
        .onAppear {
            if model.canLaunchAgents { model.agentLaunch.loadOptions() }
            model.gitExtras.loadDiscussion(name, fresh: true)
        }
        .actionRunGauntlet($gauntlet) { action, values in
            if let sending, let prompt = discussion?.prompt { run(sending, action, values, prompt) }
        }
    }

    private func list(_ discussion: PrDiscussion) -> some View {
        List {
            Section {
                if discussion.notes.isEmpty {
                    Text("No review comments yet.").foregroundStyle(.secondary)
                }
                ForEach(discussion.notes) { PrNoteRow(note: $0) }
            } header: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Review on #\(discussion.number)")
                    if !discussion.title.isEmpty { Text(discussion.title).textCase(nil).lineLimit(2) }
                }
            }
            Section {
                if !discussion.comments.isEmpty, !discussion.prompt.isEmpty, model.canLaunchAgents {
                    CiFixRows(tabs: tabs, verb: "Send to", detail: "Opens a new tab with the review") {
                        send($0, discussion.prompt)
                    }
                }
                if let url = URL(string: discussion.url), !discussion.url.isEmpty {
                    Button { openURL(url) } label: {
                        Label("Open on GitHub", systemImage: "arrow.up.right.square")
                    }
                }
            }
        }
    }

    private func send(_ option: LaunchpadOption, _ prompt: String) {
        sending = option
        if let action = option.action, gauntlet.begin(action) { return }
        run(option, option.action, [:], prompt)
    }

    private func run(_ option: LaunchpadOption, _ action: Action?, _ values: [String: String], _ prompt: String) {
        let spawned = onSpawnedTerminal
        dismiss()
        model.startFix(name, option: option, action: action, values: values, prompt: prompt) { spawned?($0) }
    }
}

/// One verdict, line comment or reply: who, what and where, then what they wrote.
private struct PrNoteRow: View {
    let note: PrDiscussion.Note

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(note.author).font(.subheadline.weight(.semibold))
                if let verdict = note.verdict {
                    Text(verdict)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(note.state == "CHANGES_REQUESTED" ? .orange
                                         : note.state == "APPROVED" ? .green : .secondary)
                } else if let place = note.place {
                    Text(place).font(.caption.monospaced()).foregroundStyle(.secondary)
                        .lineLimit(1).truncationMode(.head)
                }
            }
            if !note.body.isEmpty {
                Text(note.body).font(.callout).textSelection(.enabled)
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}
