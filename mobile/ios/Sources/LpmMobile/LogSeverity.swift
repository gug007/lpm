import Foundation

/// What a plain-text log line reports, judged as the desktop judges it
/// (logSeverity.ts): by the shapes dev servers, build tools and loggers print
/// errors and warnings in. Keep the patterns in step with it.
enum LogSeverity {
    case error, warning

    private static func re(_ pattern: String, ignoringCase: Bool = false) -> NSRegularExpression {
        try! NSRegularExpression(pattern: pattern, options: ignoringCase ? [.caseInsensitive] : [])
    }

    private static let nothingWrong = re(#"\b(?:0|no|zero|without)\s+(?:errors?|warnings?|problems?)\b"#,
                                         ignoringCase: true)

    private static let errorPatterns = [
        re(#"\b(?:ERROR|FATAL|CRITICAL|PANIC|EMERG)\b|\bERR!"#),
        re(#"\blevel["']?\s*[=:]\s*["']?(?:error|err|fatal|critical|panic)\b"#, ignoringCase: true),
        re(#"^\s*(?:\[(?:error|fatal)\]|\((?:error|fatal)\)|(?:error|fatal)(?:\[[A-Z]?\d+\])?(?::|\s{2,}|\s-\s))"#,
           ignoringCase: true),
        re(#"^\s*[⨯✖✗✘×]\s"#),
        re(#"^\s*\d+:\d+\s+error\s{2}"#),
        re(#"\berror(?:\[[A-Z]?\d+\])?:"#),
        re(#"\berror TS\d+\b"#),
        re(#"(?:^|\s)Error:"#),
        re(#"\b[A-Z][A-Za-z0-9_]*(?:Error|Exception)\b(?::|\s\(|$)"#),
        re(#"^[A-Z]\w*(?:::[A-Z]\w*)+ \("#),
        re(#"^Traceback \(most recent call last\)"#),
        re(#"^panic: |^thread '.*' panicked at "#),
        re(#"\bUnhandled ?(?:Promise ?)?Rejection|\bUncaught\b"#),
        re(#"\bCompleted 5\d\d\b"#),
        re(#"\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+(?:\s+HTTP/[\d.]+")?\s+5\d\d\b"#),
    ]

    private static let warningPatterns = [
        re(#"\b(?:WARN|WARNING)\b"#),
        re(#"\blevel["']?\s*[=:]\s*["']?(?:warn|warning)\b"#, ignoringCase: true),
        re(#"^\s*(?:\[(?:warn|warning)\]|\((?:warn|warning)\)|(?:warn|warning)(?::|\s{2,}|\s-\s))"#,
           ignoringCase: true),
        re(#"^\s*\d+:\d+\s+warning\s{2}"#),
        re(#"\bwarning(?:\[[\w-]+\])?:"#),
        re(#"(?:^|[\s)])Warning:"#),
        re(#"\b[A-Z][A-Za-z0-9_]*Warning\b"#),
        re(#"⚠"#),
    ]

    /// A word or mark every pattern above needs, so one test rules out most lines.
    private static let mightReport =
        re(#"err|fatal|crit|panic|emerg|exception|traceback|unhandled|uncaught|warn|::|5\d\d|[⚠⨯✖✗✘×]"#,
           ignoringCase: true)

    private static let stackFrame = re(#"^\s+at\s"#)
    private static let stackLine = re(#"^\s+\S|^\s*(?:at |File "|from |Caused by:|\.\.\. \d+ more)"#)

    private static let maxStackLines = 30

    private static func matches(_ regex: NSRegularExpression, _ line: String) -> Bool {
        regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) != nil
    }

    /// What `line` reports; stack frames under an error are not errors of their own.
    static func of(_ line: String) -> LogSeverity? {
        guard matches(mightReport, line), !matches(stackFrame, line), !matches(nothingWrong, line) else {
            return nil
        }
        if errorPatterns.contains(where: { matches($0, line) }) { return .error }
        if warningPatterns.contains(where: { matches($0, line) }) { return .warning }
        return nil
    }

    /// The lines of `text`, without line endings.
    static func lines(_ text: String) -> [String] {
        text.components(separatedBy: "\n").map { $0.hasSuffix("\r") ? String($0.dropLast()) : $0 }
    }

    /// The errors in `lines`, one block of line indices per report: an error
    /// line with the stack printed under it.
    static func errorBlocks(_ lines: [String]) -> [[Int]] {
        var blocks: [[Int]] = []
        var stack = 0
        for (i, raw) in lines.enumerated() {
            let line = raw.trimmingTrailingWhitespace
            let blank = line.allSatisfy(\.isWhitespace)
            let found = blank ? nil : of(line)
            if found == .error {
                blocks.append([i])
                stack = maxStackLines
            } else if found == nil, stack > 0, !blank, matches(stackLine, line) {
                blocks[blocks.count - 1].append(i)
                stack -= 1
            } else {
                stack = 0
            }
        }
        return blocks
    }
}

private extension String {
    var trimmingTrailingWhitespace: String {
        guard let last = lastIndex(where: { !$0.isWhitespace }) else { return "" }
        return String(self[...last])
    }
}
