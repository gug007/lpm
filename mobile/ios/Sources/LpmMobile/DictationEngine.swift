import AVFoundation
import Speech
import os

enum DictationFailure: Error, Equatable {
    case noSpeech
    case denied
    case unavailable
    /// The Mac transcribing the take said why it couldn't, in words worth showing.
    case computer(String)

    var message: String {
        switch self {
        case .noSpeech: return "No speech detected."
        case .denied: return "Allow the microphone and speech recognition for lpm in Settings."
        case .unavailable: return "Speech recognition isn't available right now."
        case .computer(let message): return message
        }
    }

    var canRetry: Bool {
        switch self {
        case .noSpeech, .computer: return true
        case .denied, .unavailable: return false
        }
    }
}

/// The current input level, 0...1: written from the audio thread, read when the
/// recorder draws.
final class DictationMeter: @unchecked Sendable {
    private let lock = OSAllocatedUnfairLock(initialState: Float(0))

    var level: Float {
        get { lock.withLock { $0 } }
        set { lock.withLock { $0 = newValue } }
    }
}

/// Where the audio tap sends its buffers, swapped if recognition has to start again.
private final class DictationFeed: @unchecked Sendable {
    private let lock = OSAllocatedUnfairLock<SFSpeechAudioBufferRecognitionRequest?>(initialState: nil)

    var request: SFSpeechAudioBufferRecognitionRequest? {
        get { lock.withLockUnchecked { $0 } }
        set { lock.withLockUnchecked { $0 = newValue } }
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.withLockUnchecked { $0?.append(buffer) }
    }
}

/// One take: `start` begins listening and answers why it couldn't, `stop` finishes
/// with what was heard, and `cancel` drops it. `heard` gets the words so far each
/// time they change, and `finished` runs at most once.
@MainActor
protocol DictationEngine: AnyObject {
    func start(meter: DictationMeter,
               heard: @escaping @MainActor (String) -> Void,
               finished: @escaping @MainActor (Result<String, DictationFailure>) -> Void) async -> DictationFailure?
    func stop()
    func cancel()
}

/// Speech recognition on the phone, for a computer without VoiceToText, and with the
/// words staying on the device wherever it can recognize them there.
@MainActor
final class SpeechDictationEngine: DictationEngine {
    /// How long a stopped take waits for the last words before keeping what it has.
    private static let finishTimeout: Duration = .seconds(6)

    private let microphone = DictationMicrophone()
    private let feed = DictationFeed()
    private var recognizer: SFSpeechRecognizer?
    private var task: SFSpeechRecognitionTask?
    private var onDevice = false
    private var transcript = DictationTranscript()
    private var heard: (@MainActor (String) -> Void)?
    private var finished: (@MainActor (Result<String, DictationFailure>) -> Void)?
    private var finishTimer: Task<Void, Never>?

    func start(meter: DictationMeter,
               heard: @escaping @MainActor (String) -> Void,
               finished: @escaping @MainActor (Result<String, DictationFailure>) -> Void) async -> DictationFailure? {
        guard await Self.authorized() else { return .denied }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { return .unavailable }

        let opened = microphone.open(meter: meter, deliver: { [feed] in feed.append($0) },
                                     lost: { [weak self] in self?.stop() })
        guard opened else { return .unavailable }
        self.recognizer = recognizer
        self.heard = heard
        self.finished = finished
        recognize(onDevice: recognizer.supportsOnDeviceRecognition)
        return nil
    }

    private func recognize(onDevice: Bool) {
        guard let recognizer else { return }
        self.onDevice = onDevice
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.addsPunctuation = true
        request.taskHint = .dictation
        request.requiresOnDeviceRecognition = onDevice
        feed.request = request
        // The recognizer calls back on the main queue.
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            MainActor.assumeIsolated { self?.handle(result, error: error) }
        }
    }

    func stop() {
        guard finished != nil else { return }
        microphone.close()
        feed.request?.endAudio()
        finishTimer = Task { [weak self] in
            try? await Task.sleep(for: Self.finishTimeout)
            guard !Task.isCancelled else { return }
            self?.finish(failure: .noSpeech)
        }
    }

    func cancel() {
        heard = nil
        finished = nil
        finishTimer?.cancel()
        task?.cancel()
        task = nil
        feed.request = nil
        microphone.close()
    }

    private func handle(_ result: SFSpeechRecognitionResult?, error: Error?) {
        if let result {
            transcript.hear(result.bestTranscription.formattedString,
                            utteranceEnded: result.isFinal || result.speechRecognitionMetadata != nil)
            heard?(transcript.text)
        }
        // A phone can report on-device recognition and still fail to load it, when
        // its language hasn't been downloaded: carry on with Apple's servers.
        if let error, onDevice, microphone.listening, transcript.text.isEmpty, Self.failure(for: error) != .noSpeech {
            recognize(onDevice: false)
            return
        }
        if error != nil || result?.isFinal == true {
            finish(failure: Self.failure(for: error))
        }
    }

    private func finish(failure: DictationFailure) {
        guard let finished else { return }
        self.finished = nil
        heard = nil
        finishTimer?.cancel()
        microphone.close()
        task = nil
        feed.request = nil
        let words = transcript.text
        finished(words.isEmpty ? .failure(failure) : .success(words))
    }

    private static func failure(for error: Error?) -> DictationFailure {
        guard let error = error as NSError? else { return .noSpeech }
        let noSpeech = error.domain == "kAFAssistantErrorDomain" && error.code == 1110
        return noSpeech ? .noSpeech : .unavailable
    }

    private static func authorized() async -> Bool {
        guard await AVAudioApplication.requestRecordPermission() else { return false }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }
}
