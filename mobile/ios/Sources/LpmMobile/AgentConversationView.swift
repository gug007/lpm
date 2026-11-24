import SwiftUI

/// An agent tab as a conversation instead of a terminal: what was asked, what the
/// agent said, and a line for each thing it did. It covers the terminal, which stays
/// live underneath, so the composer below goes on sending to the same tab.
struct AgentConversationView: View {
    @Environment(AppModel.self) private var model
    let source: AnswerSource
    let background: Color
    let onOpenPath: (String) -> Void
    /// Shows the terminal, for what can only be answered there.
    let onShowTerminal: () -> Void
    // The room the list has; when the keyboard takes some, the end stays in view.
    @State private var height: CGFloat = 0

    private var ready: Bool { model.demoMode || model.link.isReady }

    var body: some View {
        let list = model.conversations.list(source.terminal)
        let rows = ConversationRow.rows(list.items)
        let agent = model.agentRow(terminal: source.terminal, project: source.project)
        // The agent is still at it, so a call without its result is one going on now.
        let live = agent?.state == .working || agent?.state == .needsYou
        // The question on screen for a waiting agent: the list ends on it.
        let question = agent.flatMap { model.agentDialogs.read(terminal: source.terminal, key: $0.id)?.dialog?.id }
        ScrollViewReader { proxy in
            FollowingScrollView(follow: Follow(list: list, agent: agent, question: question, height: height),
                                returnToEnd: !list.sending.isEmpty) {
                VStack(alignment: .leading, spacing: 14) {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if list.more { earlier(list, above: rows.first?.id, proxy) }
                        ForEach(rows) { row in
                            ConversationRowView(source: source, row: row, live: live, onOpenPath: onOpenPath)
                                .id(row.id)
                        }
                    }
                    ForEach(list.sending) { prompt in
                        ConversationPendingPrompt(text: prompt.text, queued: agent?.state == .working)
                    }
                    ConversationStatus(source: source, agent: agent, onShowTerminal: onShowTerminal)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 14)
            }
        }
        .overlay { placeholder(list) }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onGeometryChange(for: CGFloat.self, of: { $0.size.height }) { height = $0 }
        .background(background)
        .environment(\.colorScheme, .dark)
        // Again once the link is back: the Mac forgets a dropped connection's watch.
        .task(id: "\(source.terminal)|\(ready)") {
            guard ready else { return }
            await model.conversations.follow(source)
        }
    }

    private func earlier(_ list: ConversationList, above first: ConversationRow.ID?,
                         _ proxy: ScrollViewProxy) -> some View {
        Button {
            Task {
                await model.conversations.loadEarlier(source)
                // What was at the top stays there, with the older entries above it.
                if let first { proxy.scrollTo(first, anchor: .top) }
            }
        } label: {
            HStack(spacing: 8) {
                if list.loadingEarlier { ProgressView().controlSize(.small) }
                Text("Show Earlier")
            }
            .font(.footnote.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 32)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .tint(.white)
        .disabled(list.loadingEarlier || !ready)
    }

    @ViewBuilder
    private func placeholder(_ list: ConversationList) -> some View {
        if list.items.isEmpty, list.sending.isEmpty {
            if let error = list.error {
                ContentUnavailableView("Couldn't Load the Conversation", systemImage: "exclamationmark.triangle",
                                       description: Text(error))
            } else if list.loaded {
                ContentUnavailableView("No Conversation Yet", systemImage: "text.bubble",
                                       description: Text("What you ask and what the agent answers shows up here."))
            } else if ready {
                ProgressView().tint(.white)
            }
        }
    }

    /// What, landing, takes the reader to the end while they're at it.
    private struct Follow: Equatable {
        let last: ConversationItem?
        let count: Int
        let sending: Int
        let state: AgentState?
        let question: String?
        let height: CGFloat

        init(list: ConversationList, agent: ProjectAgentRow?, question: String?, height: CGFloat) {
            last = list.items.last
            count = list.items.count
            sending = list.sending.count
            state = agent?.state
            self.question = question
            self.height = height
        }
    }
}

/// How the turn stands, at the end of the list: at work, or waiting on an answer —
/// with the question to answer here when the Mac can read it.
private struct ConversationStatus: View {
    @Environment(AppModel.self) private var model
    let source: AnswerSource
    let agent: ProjectAgentRow?
    let onShowTerminal: () -> Void

    var body: some View {
        if let agent {
            switch agent.state {
            case .working: working(agent)
            case .needsYou: needsYou(agent)
            case .error, .done, .idle: EmptyView()
            }
        }
    }

    private func working(_ agent: ProjectAgentRow) -> some View {
        HStack(spacing: 6) {
            if let pause = agent.pause {
                Text("\(AgentPause.label) · \(pause.shellsLabel)").agentTone(agent)
            } else {
                Text(AgentState.working.label).agentTone(agent)
                if let since = agent.since {
                    ElapsedText(since: since, until: agent.until).foregroundStyle(.secondary)
                }
            }
        }
        .font(.subheadline.weight(.medium))
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private func needsYou(_ agent: ProjectAgentRow) -> some View {
        Group {
            if let read = model.agentDialogs.read(terminal: source.terminal, key: agent.id), let dialog = read.dialog {
                AgentAskCard(read: read, dialog: dialog, open: onShowTerminal)
            } else {
                HStack(spacing: 8) {
                    Image(systemName: "bell.fill")
                    Text(AgentState.needsYou.label)
                    Spacer(minLength: 8)
                    Button("Show Terminal", action: onShowTerminal)
                        .buttonStyle(.bordered)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)
                }
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.orange)
                .tint(.orange)
            }
        }
        .task(id: "\(agent.id)|\(agent.since ?? 0)") {
            await model.agentDialogs.follow(project: source.project, terminal: source.terminal, key: agent.id)
        }
    }
}
