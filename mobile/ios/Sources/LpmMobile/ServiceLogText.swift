import SwiftUI

/// A service's log as the logs sheet shows it: the lines reporting an error,
/// with the stack printed under each, in red.
enum ServiceLogText {
    static func tinted(_ text: String) -> AttributedString {
        let lines = LogSeverity.lines(text)
        let errors = Set(LogSeverity.errorBlocks(lines).joined())
        guard !errors.isEmpty else { return AttributedString(text) }
        var out = AttributedString()
        var start = 0
        // Appends a run of lines at a time: the lines between two changes of colour.
        for end in 1...lines.count where end == lines.count || errors.contains(end) != errors.contains(start) {
            var run = AttributedString(lines[start..<end].joined(separator: "\n") + (end < lines.count ? "\n" : ""))
            if errors.contains(start) { run.foregroundColor = Color(.systemRed) }
            out += run
            start = end
        }
        return out
    }
}
