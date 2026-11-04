import Foundation

/// Demo Mode's take: a moving trace and a sample sentence that appears word by word,
/// without touching the microphone, so the mic works the same with no permissions
/// and no computer.
@MainActor
final class DemoDictationEngine: DictationEngine {
    static let words = "Run the tests and fix anything that fails."
    private static let transcribing: Duration = .milliseconds(600)
    private static let levelStep: Duration = .milliseconds(70)
    private static let wordStep: Duration = .milliseconds(260)

    private var heard: (@MainActor (String) -> Void)?
    private var finished: (@MainActor (Result<String, DictationFailure>) -> Void)?
    private var ticker: Task<Void, Never>?
    private var speaker: Task<Void, Never>?
    private var ending: Task<Void, Never>?

    func start(meter: DictationMeter,
               heard: @escaping @MainActor (String) -> Void,
               finished: @escaping @MainActor (Result<String, DictationFailure>) -> Void) async -> DictationFailure? {
        self.heard = heard
        self.finished = finished
        ticker = Task {
            while !Task.isCancelled {
                meter.level = .random(in: 0.2...0.9)
                try? await Task.sleep(for: Self.levelStep)
            }
        }
        speaker = Task {
            let words = Self.words.split(separator: " ")
            for count in 1...words.count {
                try? await Task.sleep(for: Self.wordStep)
                guard !Task.isCancelled else { return }
                heard(words.prefix(count).joined(separator: " "))
            }
        }
        return nil
    }

    func stop() {
        ticker?.cancel()
        speaker?.cancel()
        heard?(Self.words)
        ending = Task { [weak self] in
            try? await Task.sleep(for: Self.transcribing)
            guard !Task.isCancelled, let self, let finished = self.finished else { return }
            self.finished = nil
            finished(.success(Self.words))
        }
    }

    func cancel() {
        finished = nil
        heard = nil
        ticker?.cancel()
        speaker?.cancel()
        ending?.cancel()
    }
}
