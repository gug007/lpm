import AVFoundation
import Foundation

/// One step of a take the Mac is transcribing.
struct DictationEvent {
    let id: String
    let kind: String
    let text: String
    let code: String
    let message: String

    init(_ o: [String: Any]) {
        id = o["id"] as? String ?? ""
        kind = o["event"] as? String ?? ""
        text = o["text"] as? String ?? ""
        code = o["code"] as? String ?? ""
        message = o["message"] as? String ?? ""
    }
}

/// A take in the Mac's own VoiceToText: the phone streams what it hears and the
/// model picked there turns it into text, as it does for the desktop's mic.
@MainActor
final class ComputerDictationEngine: DictationEngine {
    /// Past Stop the Mac is silent while it transcribes, and a long take on a slow
    /// model takes minutes. This only ends a wait for an answer that was lost.
    private static let answerTimeout: Duration = .seconds(300)

    private let id = UUID().uuidString
    private let microphone = DictationMicrophone()
    private let encoder = DictationPCMEncoder()
    private weak var client: LpmClient?
    private var words = ""
    private var heard: (@MainActor (String) -> Void)?
    private var finished: (@MainActor (Result<String, DictationFailure>) -> Void)?
    private var watchdog: Task<Void, Never>?
    private var stopping: Bool { watchdog != nil }

    init(client: LpmClient) {
        self.client = client
    }

    func start(meter: DictationMeter,
               heard: @escaping @MainActor (String) -> Void,
               finished: @escaping @MainActor (Result<String, DictationFailure>) -> Void) async -> DictationFailure? {
        guard await AVAudioApplication.requestRecordPermission() else { return .denied }
        client?.dictateStart(id)
        let opened = microphone.open(meter: meter, deliver: { [weak self, encoder] buffer in
            for piece in encoder.encode(buffer) {
                DispatchQueue.main.async {
                    MainActor.assumeIsolated { self?.send(piece) }
                }
            }
        }, lost: { [weak self] in self?.stop() })
        guard opened else {
            client?.dictateCancel(id)
            return .unavailable
        }
        self.heard = heard
        self.finished = finished
        return nil
    }

    func stop() {
        guard finished != nil, !stopping else { return }
        microphone.close()
        let tail = encoder.drain()
        // Queued behind the pieces already on their way here, so Stop can't pass them.
        DispatchQueue.main.async { [weak self] in
            MainActor.assumeIsolated {
                guard let self, self.finished != nil else { return }
                if let tail { self.client?.dictateAudio(self.id, pcm: tail) }
                self.client?.dictateStop(self.id)
            }
        }
        armWatchdog()
    }

    func cancel() {
        guard finished != nil else { return }
        heard = nil
        finished = nil
        watchdog?.cancel()
        microphone.close()
        client?.dictateCancel(id)
    }

    func apply(_ event: DictationEvent) {
        guard event.id == id, finished != nil else { return }
        if stopping { armWatchdog() }
        switch event.kind {
        case "partial":
            words = event.text
            heard?(words)
        case "transcript":
            finish(.success(event.text))
        case "error":
            finish(.failure(Self.failure(for: event)))
        default:
            break
        }
    }

    /// The Mac cancels the take when the socket closes, so there's no more to come.
    func linkLost() {
        finish(.failure(.computer("Lost the connection to your Mac.")))
    }

    private func send(_ pcm: String) {
        guard finished != nil else { return }
        client?.dictateAudio(id, pcm: pcm)
    }

    /// Words a live model already showed are better kept than lost to a failure.
    private func finish(_ result: Result<String, DictationFailure>) {
        guard let finished else { return }
        self.finished = nil
        heard = nil
        watchdog?.cancel()
        microphone.close()
        if case .failure = result, !words.isEmpty {
            finished(.success(words))
        } else {
            finished(result)
        }
    }

    private func armWatchdog() {
        watchdog?.cancel()
        watchdog = Task { [weak self] in
            try? await Task.sleep(for: Self.answerTimeout)
            guard !Task.isCancelled else { return }
            self?.finish(.failure(.computer("Your Mac didn't send the words back.")))
        }
    }

    private static func failure(for event: DictationEvent) -> DictationFailure {
        event.code == "too_short" || event.code == "no_speech" ? .noSpeech : .computer(event.message)
    }
}
