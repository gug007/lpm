import Foundation

/// Asking an agent for an image, which it makes with `lpm generate` and the
/// keys saved in lpm. Kept word for word in step with the desktop's
/// `imageRequest.ts`, so a prompt reads the same whichever screen sent it.
enum ImageRequest {
    private static let ask = "Make an image with `lpm generate image`"

    /// The prompt as the agent receives it. A prompt that already asks goes
    /// through untouched, so a re-sent one isn't wrapped twice.
    static func build(prompt: String) -> String {
        if prompt.drop(while: \.isWhitespace).hasPrefix(ask) { return prompt }
        return "\(ask): \(prompt.trimmingCharacters(in: .whitespacesAndNewlines))"
    }
}
