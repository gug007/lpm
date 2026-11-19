import Foundation

/// A video answer as a terminal's composer offers it, where its agent can make
/// one. Kept in step with Android's `ComposerVideo`.
struct ComposerVideo {
    /// Why the computer the terminal runs on can't make a video.
    let offReason: String?
    /// The next prompt asks the agent for a video of its answer.
    let on: Bool

    /// Nil where there is no video to offer: no agent here, or its command list
    /// doesn't hold the skill.
    init?(cli: String, commands: [SlashCommand], record: MacRecord?, picked: Bool) {
        guard !cli.isEmpty, commands.contains(where: { $0.name == VideoRequest.skill }) else { return nil }
        offReason = record?.isMac == false ? "Videos record on a Mac" : nil
        on = picked && offReason == nil
    }
}
