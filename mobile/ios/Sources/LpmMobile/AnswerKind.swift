import Foundation

/// What the next prompt asks the agent to answer with, instead of text. Kept in
/// step with the desktop's `answerKind.ts` and Android's `AnswerKind`.
enum AnswerKind: String, CaseIterable {
    case video, image

    /// The "+" menu row that turns it on.
    var menuLabel: String { self == .video ? "Answer as a video" : "Generate image" }

    /// What a prompt asks the agent for.
    private var askedFor: String { self == .video ? "a video" : "an image" }

    /// The chip the composer shows while it's on.
    var chip: String { self == .video ? "Video" : "Image" }

    var symbol: String { self == .video ? "video" : "photo" }

    /// Send's face while it's on.
    var sendSymbol: String { self == .video ? "play.fill" : symbol }
    var sendLabel: String { "Send for \(askedFor)" }
    var placeholder: String { "Ask for \(askedFor)…" }

    static let backToText = "Back to a text answer"

    /// The prompt as the agent receives it.
    func request(cli: String, prompt: String) -> String {
        self == .video ? VideoRequest.build(cli: cli, prompt: prompt) : ImageRequest.build(prompt: prompt)
    }
}
