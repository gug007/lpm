import Foundation

/// One answer other than text as a terminal's composer offers it. Kept in step
/// with Android's `AnswerOffer`.
struct AnswerOffer {
    /// Why it can't be asked for here.
    let offReason: String?

    /// A video, where the agent's command list holds the skill.
    static func video(cli: String, commands: [SlashCommand], record: MacRecord?) -> AnswerOffer? {
        guard !cli.isEmpty, commands.contains(where: { $0.name == VideoRequest.skill }) else { return nil }
        return AnswerOffer(offReason: record?.isMac == false ? "Videos record on a Mac" : nil)
    }

    /// An image, wherever an agent runs.
    static func image(cli: String, sshProject: Bool) -> AnswerOffer? {
        guard !cli.isEmpty else { return nil }
        return AnswerOffer(offReason: sshProject ? "Not available in SSH projects" : nil)
    }
}
