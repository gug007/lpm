import Foundation

/// The feedback box as the desktop's feedbackDraft.ts reads it: what kind of
/// feedback the text reads like, and the issue title it turns into.
enum FeedbackKind: String, CaseIterable, Identifiable {
    case bug, suggestion, question

    var id: String { rawValue }

    var title: String {
        switch self {
        case .bug: "Bug"
        case .suggestion: "Idea"
        case .question: "Question"
        }
    }

    /// Bugs are work to track, so they become issues; ideas and questions are a
    /// conversation others can join, so they become discussions.
    var opens: String {
        switch self {
        case .bug: "Open GitHub Issue"
        case .suggestion, .question: "Start GitHub Discussion"
        }
    }

    var hint: String {
        switch self {
        case .bug: "Bugs open a GitHub issue, where the fix is tracked."
        case .suggestion: "Ideas start a GitHub discussion others can upvote."
        case .question: "Questions start a Q&A discussion anyone can answer."
        }
    }
}

enum FeedbackDraft {
    static let repo = "https://github.com/gug007/lpm"

    private static let bug = [
        #"\b(bug|crash(es|ed|ing)?|errors?|exceptions?|broken|fail(s|ed|ing|ure)?|freez(e|es|ing)|froze|frozen|hangs?|hanging|stuck|glitch(es|y)?|regression)\b"#,
        #"\b(doesn't|does not|don't|do not|didn't|did not|won't|will not|can't|cannot|isn't|is not|not|stopped) (work|working|load|loading|open|opening|start|starting|show|showing|save|saving|respond|responding)\b"#,
        #"\bnothing happens\b"#,
    ]
    private static let suggestion = [
        #"\b(could|would) (it|you|lpm|we|there)\b"#,
        #"\b(would|it'd) be (nice|great|cool|useful|helpful|handy)\b"#,
        #"\b(i'd|i would) (like|love)\b"#,
        #"\b(add|support|allow|let me)\b"#,
        #"\b(wish|suggest|suggestion|idea|feature request)\b"#,
        #"\b(an option|a setting|a button|a shortcut) (to|for)\b"#,
    ]
    private static let question = [
        #"^(how|what|why|where|when|which|who|is there|are there|can i|do i|does|is it|should i)\b"#,
        #"\bhow (do|can|to|does)\b"#,
        #"\bis (it|there) (possible|a way)\b"#,
    ]

    private static func hits(_ patterns: [String], _ text: String) -> Double {
        Double(patterns.filter { text.range(of: $0, options: .regularExpression) != nil }.count)
    }

    /// The kind the text most reads like, or nil while there's nothing to read. A
    /// question mark alone counts for less than a word; ties go to bug, then idea.
    static func guessKind(_ text: String) -> FeedbackKind? {
        let normalized = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .replacingOccurrences(of: "\u{2018}", with: "'").replacingOccurrences(of: "\u{2019}", with: "'")
        if normalized.isEmpty { return nil }
        let b = hits(bug, normalized)
        let s = hits(suggestion, normalized)
        let q = hits(question, normalized) + (normalized.contains("?") ? 0.5 : 0)
        if b == 0 && s == 0 && q == 0 { return .suggestion }
        if b >= s && b >= q { return .bug }
        return s >= q ? .suggestion : .question
    }

    private static let titleMax = 80

    /// The first sentence of the first line, cut at a word near 80 characters.
    static func title(_ text: String) -> String {
        let line = text.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init)?
            .trimmingCharacters(in: .whitespaces) ?? ""
        var sentence = line
        if let end = line.range(of: #"^.*?[.!?](?=\s|$)"#, options: .regularExpression) {
            sentence = String(line[end])
        }
        if sentence.hasSuffix(".") { sentence.removeLast() }
        if sentence.count <= titleMax { return sentence }
        let cut = String(sentence.prefix(titleMax + 1))
        let head: String
        if let space = cut.lastIndex(of: " "), cut.distance(from: cut.startIndex, to: space) > titleMax / 2 {
            head = String(cut[..<space])
        } else {
            head = String(sentence.prefix(titleMax))
        }
        return head.replacingOccurrences(of: #"[\s,;:–-]+$"#, with: "", options: .regularExpression) + "…"
    }

    /// The new issue or discussion on lpm's repository, filled in.
    static func url(kind: FeedbackKind, title: String, body: String) -> URL? {
        // Everything but the unreserved characters escaped, `+` included, which
        // GitHub would otherwise read as a space.
        let unreserved = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        let encode = { (value: String) in value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? "" }
        var query: [String] = []
        if kind == .suggestion { query.append("category=ideas") }
        if kind == .question { query.append("category=q-a") }
        query.append("title=" + encode(title))
        query.append("body=" + encode(body))
        if kind == .bug { query.append("labels=bug") }
        return URL(string: repo + (kind == .bug ? "/issues/new?" : "/discussions/new?") + query.joined(separator: "&"))
    }
}
