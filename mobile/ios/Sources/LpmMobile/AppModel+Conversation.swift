import Foundation

extension AppModel {
    /// The terminal whose conversation the screen can show, on a Mac that reads it.
    func conversationSource(terminal id: String, project name: String) -> AnswerSource? {
        conversations.available ? transcriptSource(terminal: id, project: name) : nil
    }

    /// The agent a terminal's row is about, when it has one.
    func agentRow(terminal id: String, project name: String) -> ProjectAgentRow? {
        guard let project = projects.first(where: { $0.name == name }) else { return nil }
        let rows = projectAgentRows(project, now: Int(Date().timeIntervalSince1970 * 1000), tabTitles: [:])
        return agentRowsByTerminal(rows)[id]
    }

    func wireConversations(_ c: LpmClient) {
        c.onConversation = { [weak self] update in self?.conversations.apply(update) }
        c.onConversationPage = { [weak self] reqId, page, error in
            self?.conversations.deliverPage(reqId: reqId, page, error: error)
        }
        c.onConversationDetail = { [weak self] reqId, parts, error in
            self?.conversations.deliverDetail(reqId: reqId, parts, error: error)
        }
    }
}
