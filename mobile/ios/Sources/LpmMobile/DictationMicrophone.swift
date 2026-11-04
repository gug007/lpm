import AVFoundation

/// The microphone during a take: the audio session, the input tap and the level.
@MainActor
final class DictationMicrophone {
    private let audio = AVAudioEngine()
    private var meter: DictationMeter?
    private var deliver: (@Sendable (AVAudioPCMBuffer) -> Void)?
    private var lost: (() -> Void)?
    private var routeObserver: NSObjectProtocol?
    /// What the session was set to, handed back so playback isn't left muted.
    private var previousSession: (category: AVAudioSession.Category, mode: AVAudioSession.Mode)?
    private(set) var listening = false

    /// Starts sending `deliver` what the mic hears, on the audio thread, and answers
    /// whether it could. `lost` runs if the audio can't be picked back up.
    func open(meter: DictationMeter,
              deliver: @escaping @Sendable (AVAudioPCMBuffer) -> Void,
              lost: @escaping () -> Void) -> Bool {
        let session = AVAudioSession.sharedInstance()
        previousSession = (session.category, session.mode)
        do {
            try session.setCategory(.record, mode: .measurement)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            releaseSession()
            return false
        }
        self.meter = meter
        self.deliver = deliver
        self.lost = lost
        guard startAudio() else {
            releaseSession()
            return false
        }
        listening = true
        // Plugging in headphones or connecting AirPods stops the engine, right at the
        // start of a take if they were already there. Pick the audio back up.
        routeObserver = NotificationCenter.default.addObserver(
            forName: .AVAudioEngineConfigurationChange, object: audio, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.resumeAudio() }
        }
        return true
    }

    func close() {
        guard listening else { return }
        listening = false
        if let routeObserver { NotificationCenter.default.removeObserver(routeObserver) }
        routeObserver = nil
        audio.inputNode.removeTap(onBus: 0)
        audio.stop()
        releaseSession()
    }

    private func startAudio() -> Bool {
        guard let meter, let deliver else { return false }
        let input = audio.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return false }
        input.installTap(onBus: 0, bufferSize: 1024, format: format,
                         block: Self.tap(deliver: deliver, meter: meter))
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
        if !startAudio() { lost?() }
    }

    private func releaseSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        if let previousSession { try? session.setCategory(previousSession.category, mode: previousSession.mode) }
        previousSession = nil
    }

    private nonisolated static func tap(deliver: @escaping @Sendable (AVAudioPCMBuffer) -> Void,
                                        meter: DictationMeter) -> AVAudioNodeTapBlock {
        { buffer, _ in
            deliver(buffer)
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
