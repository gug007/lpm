import Foundation

/// A commit a git hook stopped, as the Mac read it (PROTOCOL.md, `gitCommit`'s
/// `hookFailure`): the desktop's `HookFailure`, with what its panel says.
struct CommitHookFailure: Equatable {
    /// The hook's name as git calls it: "pre-commit", "commit-msg".
    let hook: String
    /// What it found in a few words, when its output says.
    let summary: String?
    /// What it printed, without colours.
    let output: String
    /// The picked files the hook rewrote (a formatter) and left unstaged.
    let changed: [String]
    /// The lines the folded output shows: the ones that report something, else
    /// the last few (the desktop's `outputPreview`).
    let preview: [String]
    let lineCount: Int

    init?(_ o: [String: Any]?) {
        guard let o, let hook = o["hook"] as? String, !hook.isEmpty else { return nil }
        self.hook = hook
        summary = (o["summary"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        output = o["output"] as? String ?? ""
        changed = o["changed"] as? [String] ?? []
        let lines = output.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        lineCount = output.isEmpty ? 0 : lines.count
        let shown = lines.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty && !Self.isNoise($0) }
        let findings = shown.filter(Self.reportsSomething)
        preview = findings.isEmpty ? Array(shown.suffix(Self.previewLines)) : Array(findings.prefix(Self.previewLines))
    }

    var headline: String { "The \(hook) hook stopped this commit" }

    /// The Try Again button: after a formatter hook, the files it fixed go in too.
    var retryLabel: String {
        switch changed.count {
        case 0: "Try Again"
        case 1: "Add the File It Changed and Commit"
        default: "Add the \(changed.count) Files It Changed and Commit"
        }
    }

    /// "It rewrote prettier.ts and left the change out of the commit."
    var changedText: String? {
        guard !changed.isEmpty else { return nil }
        let files = changed.count == 1 ? changed[0] : "\(changed.count) files"
        return "It rewrote \(files) and left \(changed.count == 1 ? "the change" : "the changes") out of the commit."
    }

    private static let previewLines = 6
    private static let promptFiles = 30
    private static let promptLines = 120
    // lint-staged's and listr's progress rows, and a hook manager's own exit line.
    private static let noise = ["[STARTED]", "[COMPLETED]", "[SKIPPED]", "[SUCCESS]", "[TITLE]", "husky - ", "hint: "]

    private static func isNoise(_ line: String) -> Bool {
        let trimmed = line.drop { $0 == " " || $0 == "\t" }
        return noise.contains { trimmed.hasPrefix($0) }
    }

    private static func reportsSomething(_ line: String) -> Bool {
        let lower = line.lowercased()
        return ["error", "warning", "failed", "✖", "×"].contains { lower.contains($0) }
            || line.range(of: #"\d+:\d+"#, options: .regularExpression) != nil
    }

    /// What an agent asked to fix the hook's findings is told: the commit it
    /// stopped, what it printed, and to commit again with the hook running (the
    /// desktop's `commitHookPrompt`).
    func prompt(message: String, files: [String]) -> String {
        let subject = message.trimmingCharacters(in: .whitespacesAndNewlines)
            .split(separator: "\n", omittingEmptySubsequences: false).first.map(String.init) ?? ""
        let found = summary.map { " It found: \($0)." } ?? ""
        let printed = output.split(separator: "\n", omittingEmptySubsequences: false)
            .suffix(Self.promptLines).joined(separator: "\n")
        var lines = [
            "I tried to commit with the message \"\(subject)\", and the \(hook) hook stopped it.\(found) What it printed:",
            "",
            "```",
            printed,
            "```",
            "",
            "Fix what it found, then commit the same files again with the same message. Let the hook run: don't skip it with --no-verify.",
        ]
        if !files.isEmpty {
            var shown = files.prefix(Self.promptFiles).map { "- \($0)" }
            if files.count > Self.promptFiles { shown.append("- and \(files.count - Self.promptFiles) more") }
            lines += ["", "Files in the commit:"] + shown
        }
        return lines.joined(separator: "\n")
    }
}
