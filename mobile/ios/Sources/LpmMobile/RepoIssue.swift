import Foundation

/// An open issue of a project's repository (`gitIssues`), as the composer's @ menu
/// offers it.
struct RepoIssue: Identifiable, Equatable {
    let number: Int
    let title: String
    let labels: [String]

    var id: Int { number }

    init?(_ o: [String: Any]) {
        guard let number = o["number"] as? Int else { return nil }
        self.number = number
        title = o["title"] as? String ?? ""
        labels = o["labels"] as? [String] ?? []
    }

    /// By number, with or without the #, or by part of the title, as the desktop's
    /// menu searches.
    func matches(_ fragment: String) -> Bool {
        "#\(number) \(title)".localizedCaseInsensitiveContains(fragment)
    }
}

extension Array where Element == RepoIssue {
    /// What the @ menu shows: the newest few for an empty fragment, else the matches.
    func matching(_ fragment: String) -> [RepoIssue] {
        fragment.isEmpty ? Array(prefix(5)) : Array(filter { $0.matches(fragment) }.prefix(20))
    }
}

struct RepoIssuesReply {
    let project: String
    let issues: [RepoIssue]?

    init(_ o: [String: Any]) {
        project = o["project"] as? String ?? ""
        issues = o["ok"] as? Bool == true
            ? (o["issues"] as? [[String: Any]] ?? []).compactMap(RepoIssue.init) : nil
    }
}

/// One issue as the @ menu puts it in the message (`gitIssue`).
struct RepoIssueReply {
    let reqId: String
    let mention: String?
    let error: String?

    init(_ o: [String: Any]) {
        reqId = o["reqId"] as? String ?? ""
        let ok = o["ok"] as? Bool ?? false
        mention = ok ? (o["issue"] as? [String: Any])?["mention"] as? String : nil
        error = ok ? nil : (o["error"] as? String ?? "Couldn't read the issue.")
    }
}

extension Wire {
    static func gitIssues(project: String) -> String { json(["t": "gitIssues", "project": project]) }
    static func gitIssue(project: String, number: Int, reqId: String) -> String {
        json(["t": "gitIssue", "project": project, "number": number, "reqId": reqId])
    }
}
