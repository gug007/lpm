import Foundation

/// One commit of the current branch, as the Mac's `gitHistory` lists it.
struct HistoryCommit: Identifiable, Hashable {
    let hash: String
    let short: String
    let subject: String
    let body: String
    let author: String
    let email: String
    /// Author time, unix seconds.
    let time: Int
    let parents: Int
    /// "Name <email>" from each Co-authored-by trailer.
    let coAuthors: [String]
    /// On no remote branch yet; false everywhere when there is no remote.
    let unpushed: Bool

    var id: String { hash }
    var isMerge: Bool { parents > 1 }
    var date: Date { Date(timeIntervalSince1970: TimeInterval(time)) }

    init(_ o: [String: Any]) {
        hash = o["hash"] as? String ?? ""
        short = o["short"] as? String ?? String((o["hash"] as? String ?? "").prefix(7))
        subject = o["subject"] as? String ?? ""
        body = o["body"] as? String ?? ""
        author = o["author"] as? String ?? ""
        email = o["email"] as? String ?? ""
        time = o["time"] as? Int ?? 0
        parents = o["parents"] as? Int ?? 1
        coAuthors = o["coAuthors"] as? [String] ?? []
        unpushed = o["unpushed"] as? Bool ?? false
    }

    private static let agentMarks: [(agent: String, pattern: String)] = [
        ("claude", #"\bclaude\b|@anthropic\.com"#),
        ("codex", #"\bcodex\b|@openai\.com"#),
        ("gemini", #"\bgemini\b"#),
        ("opencode", #"\bopencode\b"#),
    ]

    /// The coding agent a co-author trailer credits, as the desktop marks it.
    var agent: String? {
        for coAuthor in coAuthors {
            for mark in Self.agentMarks
            where coAuthor.range(of: mark.pattern, options: [.regularExpression, .caseInsensitive]) != nil {
                return mark.agent
            }
        }
        return nil
    }

    /// Each co-author's name without the address: "Claude Opus 5.5".
    var coAuthorNames: [String] {
        coAuthors.map { coAuthor in
            let name = coAuthor.replacingOccurrences(of: #"\s*<[^>]*>\s*$"#, with: "", options: .regularExpression)
                .trimmingCharacters(in: .whitespaces)
            return name.isEmpty ? coAuthor : name
        }
    }

    /// The whole commit message, subject and body, as Copy Message copies it.
    var fullMessage: String {
        body.isEmpty ? subject : subject + "\n\n" + body
    }

    /// The message under the subject, without the trailer lines the header shows.
    var message: String {
        body.split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).lowercased().hasPrefix("co-authored-by:") }
            .joined(separator: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

/// A page of history: the commits after `skip`, and whether older ones remain.
struct HistoryPage {
    let commits: [HistoryCommit]
    let hasMore: Bool

    init(_ o: [String: Any]) {
        commits = (o["commits"] as? [[String: Any]] ?? []).map(HistoryCommit.init)
        hasMore = o["hasMore"] as? Bool ?? false
    }
}

/// A file one commit changed, against its first parent.
struct CommitFile: Identifiable, Hashable {
    let path: String
    /// Where a renamed file came from.
    let oldPath: String?
    /// "added", "modified", "deleted" or "renamed".
    let status: String
    /// Line counts; both nil for a binary file.
    let added: Int?
    let removed: Int?

    var id: String { (oldPath ?? "") + "\n" + path }
    var isBinary: Bool { added == nil }
    var name: String { (path as NSString).lastPathComponent }
    var directory: String { (path as NSString).deletingLastPathComponent }

    init(_ o: [String: Any]) {
        path = o["path"] as? String ?? ""
        oldPath = (o["oldPath"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        status = o["status"] as? String ?? "modified"
        added = o["added"] as? Int
        removed = o["removed"] as? Int
    }
}

extension Array where Element == CommitFile {
    var lineTotals: (added: Int, removed: Int) {
        reduce((0, 0)) { ($0.0 + ($1.added ?? 0), $0.1 + ($1.removed ?? 0)) }
    }
}

extension Array where Element == HistoryCommit {
    /// Where the pushed commits start: the row the "Pushed" line goes above. Nil
    /// when every listed commit is pushed or none is.
    var remoteBoundary: Int? {
        guard let first = firstIndex(where: { !$0.unpushed }), first > 0 else { return nil }
        return first
    }
}

/// How long ago, as the desktop's History says it: "just now", "5m ago", "3d ago".
func relativeAgo(_ unix: Int, now: Date = Date()) -> String {
    guard unix > 0 else { return "" }
    let s = max(0, Int(now.timeIntervalSince1970) - unix)
    let short: String
    switch s {
    case ..<60: return "just now"
    case ..<3600: short = "\(s / 60)m"
    case ..<86_400: short = "\(s / 3600)h"
    case ..<604_800: short = "\(s / 86_400)d"
    case ..<2_592_000: short = "\(s / 604_800)w"
    case ..<31_536_000: short = "\(s / 2_592_000)mo"
    default: short = "\(s / 31_536_000)y"
    }
    return "\(short) ago"
}
