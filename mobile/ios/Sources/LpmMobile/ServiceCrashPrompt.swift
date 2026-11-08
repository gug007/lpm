import Foundation

/// What an agent asked to fix a crashed service is told, in the words of the
/// desktop's serviceErrorPrompt.ts: the service, how it starts and how it
/// ended, then its latest errors with their stacks, or its last lines when none
/// of them reads as an error.
enum ServiceCrashPrompt {
    private static let maxErrors = 3
    private static let tailLines = 40

    static func text(service: String, cmd: String, exitCode: Int?, log: String) -> String {
        let started = cmd.isEmpty ? "" : ", started with `\(cmd)`,"
        var lines = ["The `\(service)` service in this project\(started) \(ServiceExit.text(exitCode))."]
        let errors = latestErrors(log)
        let quoted: String
        if errors.count == 1 {
            let times = errors[0].times > 1 ? " \(errors[0].times) times" : ""
            lines[0] += " It logged this error\(times):"
            quoted = errors[0].text
        } else if !errors.isEmpty {
            lines[0] += " It logged these errors, the latest last:"
            quoted = errors.map { $0.times > 1 ? "\($0.text)\n(logged \($0.times) times)" : $0.text }
                .joined(separator: "\n\n")
        } else {
            quoted = tail(log)
            if !quoted.isEmpty { lines[0] += " The last lines it printed:" }
        }
        if !quoted.isEmpty { lines += ["", "```", quoted, "```"] }
        lines += ["", "Find the cause in the code and fix it."]
        return lines.joined(separator: "\n")
    }

    /// The latest distinct errors in `log`, oldest first, each with how many
    /// times it was logged.
    private static func latestErrors(_ log: String) -> [(text: String, times: Int)] {
        let lines = LogSeverity.lines(log)
        var seen: [(text: String, times: Int)] = []
        for block in LogSeverity.errorBlocks(lines) {
            let text = block.map { lines[$0] }.joined(separator: "\n")
            let times = (seen.firstIndex { $0.text == text }.map { seen.remove(at: $0).times } ?? 0) + 1
            seen.append((text, times))
        }
        return Array(seen.suffix(maxErrors))
    }

    private static func tail(_ log: String) -> String {
        var lines = LogSeverity.lines(log)
        while let last = lines.last, last.allSatisfy(\.isWhitespace) { lines.removeLast() }
        return lines.suffix(tailLines).joined(separator: "\n")
    }
}
