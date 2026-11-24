import Foundation

/// The repository's open issues, for the composer's @ menu.
extension GitExtrasStore {
    var canReadIssues: Bool { has(LpmClient.gitIssuesFeature) }

    /// Asks again at most once a minute; the Mac keeps its own answer for two.
    func loadIssues(_ project: String) {
        guard canReadIssues else { return }
        if let at = issuesAsked[project], Date().timeIntervalSince(at) < 55 { return }
        issuesAsked[project] = Date()
        client?.requestIssues(project: project)
    }

    /// A failure just leaves the menu without issues.
    func applyIssues(_ reply: RepoIssuesReply) {
        guard let list = reply.issues else { return }
        issues[reply.project] = list
    }

    /// The issue as it goes in the message, its comments with it.
    func readIssue(_ project: String, number: Int) async throws -> String {
        try await issueReads.request {
            client?.requestIssue(project: project, number: number, reqId: $0)
        }
    }

    func applyIssue(_ reply: RepoIssueReply) {
        issueReads.deliver(reqId: reply.reqId, reply.mention, error: reply.error)
    }
}
