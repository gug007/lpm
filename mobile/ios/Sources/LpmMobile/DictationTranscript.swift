import Foundation

/// What one take has heard so far. The recognizer rewrites its current sentence as
/// it listens, and after a pause it either starts the next sentence from nothing or
/// repeats everything so far, depending on the system. Each new hypothesis therefore
/// replaces the sentence in progress, follows the settled text, or takes over from it.
struct DictationTranscript {
    private var settled = ""
    private var live = ""

    var text: String { Self.joined(settled, live) }

    mutating func hear(_ heard: String, utteranceEnded: Bool) {
        guard !heard.isEmpty else { return }
        if repeatsSettled(heard) {
            settled = ""
        } else if startsOver(heard) {
            settle()
        }
        live = heard
        if utteranceEnded { settle() }
    }

    private mutating func settle() {
        settled = text
        live = ""
    }

    private func repeatsSettled(_ heard: String) -> Bool {
        guard !settled.isEmpty, heard.count >= settled.count else { return false }
        let shared = zip(settled, heard).prefix { $0 == $1 }.count
        return shared * 5 >= settled.count * 3
    }

    // A hypothesis revises words, it doesn't drop most of them: one this much
    // shorter is a new sentence.
    private func startsOver(_ heard: String) -> Bool {
        heard.count * 2 < live.count
    }

    private static func joined(_ head: String, _ tail: String) -> String {
        if head.isEmpty { return tail }
        return tail.isEmpty ? head : head + " " + tail
    }
}

extension String {
    /// This draft with a take's words after it, spaced the way typing them would be.
    func addingDictated(_ words: String) -> String {
        if isEmpty || hasSuffix(" ") || hasSuffix("\n") { return self + words }
        return self + " " + words
    }
}
