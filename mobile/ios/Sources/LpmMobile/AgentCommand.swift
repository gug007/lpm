import Foundation

private let commandSeparators = CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ";&|"))
private let commandWord = try! NSRegularExpression(pattern: #"[^\s;&|]+"#)
private let shellWord = try! NSRegularExpression(
    pattern: #"(?:[^\s;&|"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+|[;&|]+"#)
private let quotedTask = try! NSRegularExpression(pattern: #"^(["']).*\s.*\1$"#, options: .dotMatchesLineSeparators)

/// The program a command word runs, by its file name: `/usr/local/bin/claude` and
/// `codex.exe` run `claude` and `codex`.
private func programName(_ word: String) -> String {
    var name = word.split(whereSeparator: { $0 == "/" || $0 == "\\" }).last.map(String.init) ?? word
    if let ext = [".exe", ".cmd", ".bat"].first(where: { name.lowercased().hasSuffix($0) }) {
        name.removeLast(ext.count)
    }
    return name
}

/// The agent `cmd` starts: the first command word naming one of `agents` by its
/// file name (`/usr/local/bin/claude`, `codex.exe`). Mirrors the desktop's detectAICLI.
func agentCLI(in cmd: String, among agents: [String]) -> String? {
    for word in cmd.components(separatedBy: commandSeparators) where !word.isEmpty {
        let name = programName(word)
        if agents.contains(name) { return name }
    }
    return nil
}

private func matches(_ regex: NSRegularExpression, in text: String) -> [String] {
    let ns = text as NSString
    return regex.matches(in: text, range: NSRange(location: 0, length: ns.length)).map { ns.substring(with: $0.range) }
}

extension Action {
    /// The `agent` this action opens starts on a task of its own: a saved prompt, or a
    /// quoted multi-word argument after the agent's command word that isn't a flag's
    /// value (`claude "Review my changes"`). Mirrors the desktop's startsOwnTask.
    func startsOwnTask(agent: String) -> Bool {
        if !prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
        let ns = cmd as NSString
        guard let word = commandWord.matches(in: cmd, range: NSRange(location: 0, length: ns.length))
            .first(where: { programName(ns.substring(with: $0.range)) == agent }) else { return false }
        let words = matches(shellWord, in: ns.substring(from: NSMaxRange(word.range)))
        for (i, word) in words.enumerated() {
            if let first = word.first, ";&|".contains(first) { return false }
            if !matches(quotedTask, in: word).isEmpty, i == 0 || !words[i - 1].hasPrefix("-") { return true }
        }
        return false
    }
}
