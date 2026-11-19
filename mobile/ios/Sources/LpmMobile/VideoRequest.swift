import Foundation

/// Asking an agent to answer with a narrated video instead of text. Kept in
/// step with the desktop's `videoRequest.ts`, so a prompt reads the same
/// whichever screen sent it.
enum VideoRequest {
    static let skill = "explaincast"

    /// The prompt as the agent receives it. Claude Code runs a skill as `/name`;
    /// every other agent takes the `$name` skill mention. A prompt that already
    /// calls the skill goes through untouched, so it is never wrapped twice.
    static func build(cli: String, prompt: String) -> String {
        if prompt.range(of: "^\\s*[/$]\(skill)(\\s|$)", options: .regularExpression) != nil { return prompt }
        let call = (cli == "claude" ? "/" : "$") + skill
        return "\(call) \(prompt.trimmingCharacters(in: .whitespacesAndNewlines))"
    }
}
