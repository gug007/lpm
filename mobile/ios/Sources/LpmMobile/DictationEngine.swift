import AVFoundation
import Speech
import os

enum DictationFailure: Error, Equatable {
    case noSpeech
    case denied
    case unavailable

    var message: String {
        switch self {
        case .noSpeech: return "No speech detected."
        case .denied: return "Allow the microphone and speech recognition for lpm in Settings."
        case .unavailable: return "Speech recognition isn't available right now."
        }
    }

    var canRetry: Bool { self == .noSpeech }
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

/// Speech recognition on the phone, so the mic works with every computer, and with
/// the words staying on the device wherever it can recognize them there.
@MainActor
final class SpeechDictationEngine: DictationEngine {
    /// How long a stopped take waits for the last words before keeping what it has.
    private static let finishTimeout: Duration = .seconds(6)

    private let audio = AVAudioEngine()
    private let feed = DictationFeed()
    private var recognizer: SFSpeechRecognizer?
    private var task: SFSpeechRecognitionTask?
    private var onDevice = false
    private var transcript = DictationTranscript()
    private var heard: (@MainActor (String) -> Void)?
    private var finished: (@MainActor (Result<String, DictationFailure>) -> Void)?
    private var finishTimer: Task<Void, Never>?
    private var listening = false
    private var meter: DictationMeter?
    private var routeObserver: NSObjectProtocol?
    /// What the session was set to, handed back so playback isn't left muted.
    private var previousSession: (category: AVAudioSession.Category, mode: AVAudioSession.Mode)?

    func start(meter: DictationMeter,
               heard: @escaping @MainActor (String) -> Void,
               finished: @escaping @MainActor (Result<String, DictationFailure>) -> Void) async -> DictationFailure? {
        guard await Self.authorized() else { return .denied }
        guard let recognizer = SFSpeechRecognizer(), recognizer.isAvailable else { return .unavailable }

        let session = AVAudioSession.sharedInstance()
        previousSession = (session.category, session.mode)
        do {
            try session.setCategory(.record, mode: .measurement)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            releaseSession()
            return .unavailable
        }
        self.meter = meter
        guard startAudio() else {
            releaseSession()
            return .unavailable
        }
        self.recognizer = recognizer
        self.heard = heard
        self.finished = finished
        listening = true
        // Plugging in headphones or connecting AirPods stops the engine, right at the
        // start of a take if they were already there. Pick the audio back up.
        routeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: audio, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeAudio() }
        }
        recognize(onDevice: recognizer.supportsOnDeviceRecognition)
        return nil
    }

    private func startAudio() -> Bool {
        guard let meter else { return false }
        let input = audio.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return false }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: Self.tap(into: feed, meter: meter))
        audio.prepare()
        do {
            try audio.start()
            return true
        } catch {
            input.removeTap(onBus: 0)
            return false
        }
    }

    private func resumeAudio() {
        guard listening else { return }
        audio.inputNode.removeTap(onBus: 0)
        if !startAudio() { stop() }
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
        endListening()
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
        endListening()
    }

    private func handle(_ result: SFSpeechRecognitionResult?, error: Error?) {
        if let result {
            transcript.hear(result.bestTranscription.formattedString,
                            utteranceEnded: result.isFinal || result.speechRecognitionMetadata != nil)
            heard?(transcript.text)
        }
        // A phone can report on-device recognition and still fail to load it, when
        // its language hasn't been downloaded: carry on with Apple's servers.
        if let error, onDevice, listening, transcript.text.isEmpty, Self.failure(for: error) != .noSpeech {
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
        endListening()
        task = nil
        feed.request = nil
        let words = transcript.text
        finished(words.isEmpty ? .failure(failure) : .success(words))
    }

    private func endListening() {
        guard listening else { return }
        listening = false
        if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }
        routeObserver = nil
        audio.inputNode.removeTap(onBus: 0)
        audio.stop()
        releaseSession()
    }

    private func releaseSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        if let previousSession { try? session.setCategory(previousSession.category, mode: previousSession.mode) }
        previousSession = nil
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

    private nonisolated static func tap(into feed: DictationFeed, meter: DictationMeter) -> AVAudioNodeTapBlock {
        { buffer, _ in
            feed.append(buffer)
            meter.level = level(of: buffer)
        }
    }

    // -50 dB (a quiet room) to -10 dB (close speech), as 0...1.
    private nonisolated static func level(of buffer: AVAudioPCMBuffer) -> Float {
        guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
        let count = Int(buffer.frameLength)
        var sum: Float = 0
        for i in 0..<count { sum += samples[i] * samples[i] }
        let rms = (sum / Float(count)).squareRoot()
        let decibels = 20 * log10(max(rms, 0.000_01))
        return min(max((decibels + 50) / 40, 0), 1)
    }
}
