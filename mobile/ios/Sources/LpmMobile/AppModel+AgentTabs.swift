import Foundation

/// What the phone kept of an agent tab, for reading it while the Mac is away.
struct SavedAgentTab: Equatable {
    var screen: AgentTabSnapshots.Screen?
    var answer: AgentAnswerStore.Answer?

    /// When it was last current.
    var lastSeen: Date? {
        [screen?.at, answer.map { Date(timeIntervalSince1970: Double($0.at) / 1000) }].compactMap { $0 }.max()
    }
}

extension AppModel {
    /// The Mac can't be reached right now, so what the phone kept is all there is.
    var macAway: Bool { !demoMode && connection != .ready }

    private var keepsAgentTabs: Bool { !demoMode && !isVisit && !link.pairing }

    /// The agent tabs of a project this phone has something to show of.
    func savedAgentTabs(_ project: String) async -> [TerminalInfo] {
        guard keepsAgentTabs, let record = activeRecord else { return [] }
        let tabs = link.agentTabs.tabs(project, for: record.localId)
        guard !tabs.isEmpty else { return [] }
        async let answers = keptAnswers(agentWidgetId(record))
        async let screens = link.agentTabs.withScreens(tabs.map(\.id), for: record.localId)
        let (answered, seen) = await (answers, screens)
        return tabs.filter { answered[$0.id] != nil || seen.contains($0.id) }
    }

    func savedAgentTab(_ terminal: String) async -> SavedAgentTab? {
        guard keepsAgentTabs, let record = activeRecord else { return nil }
        async let screen = link.agentTabs.screen(terminal, for: record.localId)
        async let answers = keptAnswers(agentWidgetId(record))
        let saved = SavedAgentTab(screen: await screen, answer: await answers[terminal])
        return saved == SavedAgentTab() ? nil : saved
    }

    private func keptAnswers(_ mac: String) async -> [String: AgentAnswerStore.Answer] {
        await Task.detached { AgentAnswerStore.load(mac: mac) }.value
    }

    /// Whether this tab's screen is worth keeping: an agent's, on the Mac itself.
    func keepsScreen(of term: TerminalInfo) -> Bool { keepsAgentTabs && !term.cli.isEmpty }

    func keepScreen(_ terminal: String, _ text: String, at: Date, mac: UUID) {
        guard !demoMode, !isVisit, !text.isEmpty, macs.contains(where: { $0.localId == mac }) else { return }
        link.agentTabs.saveScreen(text, at: at, terminal: terminal, for: mac)
    }

    func recordTerminalsFrame(_ project: String, _ tabs: [TerminalInfo], _ text: String) {
        guard keepsAgentTabs, let id = activeMacId else { return }
        link.agentTabs.record(project, tabs, frame: text, for: id)
    }

    /// The Mac's live list: what's kept of projects it no longer has goes, and the
    /// answers of turns that finished meanwhile are asked for.
    func keepAgentTabs(of list: [Project]) {
        guard keepsAgentTabs, let id = activeMacId else { return }
        link.agentTabs.keep(Set(list.map(\.name)), for: id)
        keepFinishedAnswers(list)
    }

    /// Ask for the answer of each turn that finished since the phone last had one, a
    /// few at a time: the newest are the ones worth reading later.
    func keepFinishedAnswers(_ list: [Project]) {
        guard keepsAgentTabs, let record = activeRecord,
              client?.hostFeatures.contains(LpmClient.agentAnswersFeature) == true else { return }
        let mac = agentWidgetId(record)
        let finished = list.filter { !$0.isRemote }.flatMap { project in
            (project.statusEntries + project.seenEntries)
                .filter { $0.value == "Done" && !$0.paneID.isEmpty && $0.hasTranscript }
                .filter { keepingAnswers[$0.paneID] != $0.timestamp }
                .map { (source: AnswerSource(terminal: $0.paneID, project: project.name), at: $0.timestamp) }
        }
        let newest = finished.sorted { $0.at > $1.at }.prefix(8)
        guard !newest.isEmpty else { return }
        for item in newest { keepingAnswers[item.source.terminal] = item.at }
        Task { @MainActor in
            let known = await keptAnswers(mac)
            let due = newest.filter { known[$0.source.terminal]?.lacks($0.at) ?? true }
            guard !due.isEmpty else { return }
            // The transcript settles a moment after the finish is reported.
            try? await Task.sleep(for: .seconds(2))
            var answers: [String: AgentAnswerStore.Answer] = [:]
            for item in due {
                guard mac == activeRecord.map(agentWidgetId), connection == .ready else { break }
                guard let answer = try? await recentAnswers(item.source, limit: 1).first else { continue }
                answers[item.source.terminal] = AgentAnswerStore.Answer(text: answer.text, at: item.at)
            }
            guard mac == activeRecord.map(agentWidgetId) else { return }
            await Task.detached { [answers] in AgentAnswerStore.record(mac: mac, answers) }.value
        }
    }
}

private extension StatusEntry {
    /// An agent whose transcript the Mac reads.
    var hasTranscript: Bool { key.hasPrefix("claude_code") || key.hasPrefix("codex") }
}
