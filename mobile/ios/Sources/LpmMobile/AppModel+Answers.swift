import Foundation

/// The terminal whose agent answers the copy key reads.
struct AnswerSource: Equatable {
    let terminal: String
    let project: String
}

extension AppModel {
    /// The terminal whose answers the copy key offers, on a Mac that serves them.
    func answerSource(terminal id: String, project name: String) -> AnswerSource? {
        guard client?.hostFeatures.contains(LpmClient.agentAnswersFeature) == true else { return nil }
        return transcriptSource(terminal: id, project: name)
    }

    /// Only Claude Code and Codex transcripts are read: an SSH project's live on the
    /// server, and another computer's tab keeps its own.
    func transcriptSource(terminal id: String, project name: String) -> AnswerSource? {
        guard let term = terminals[name]?.first(where: { $0.id == id }),
              ["claude", "codex"].contains(term.cli), !term.remote,
              !(projects.first { $0.name == name }?.isRemote ?? false)
        else { return nil }
        return AnswerSource(terminal: id, project: name)
    }

    /// While the agent is producing the next answer, the last one isn't worth
    /// copying, the same rule the desktop's copy pill follows.
    func isAgentWorking(_ source: AnswerSource) -> Bool {
        agentRow(terminal: source.terminal, project: source.project)?.state == .working
    }

    /// The terminal agent's latest answers, newest first.
    func recentAnswers(_ source: AnswerSource, limit: Int) async throws -> [RecentAnswer] {
        let client = client
        return try await answerRequests.request { reqId in
            client?.requestAnswers(id: source.terminal, project: source.project, limit: limit, reqId: reqId)
        }
    }

    func wireAnswers(_ c: LpmClient) {
        c.onAnswers = { [weak self] reqId, answers, error in
            self?.answerRequests.deliver(reqId: reqId, answers, error: error)
        }
    }
}
