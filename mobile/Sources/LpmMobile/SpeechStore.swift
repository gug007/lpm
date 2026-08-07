import AVFoundation
import MediaPlayer
import SwiftUI

/// Reads an automation result aloud with the phone's own voice. Lives on AppModel
/// rather than in a view, so playback survives leaving the chat — the point of the
/// feature is listening to a digest with the screen off.
///
/// Text is spoken one segment at a time rather than as a single utterance: that is
/// what makes pause responsive, gives progress to report, and lets skip jump by
/// sentence. AVSpeechSynthesizer has no timeline, so there is no seeking by time —
/// skip moves between segments and the progress bar counts characters spoken.
@Observable @MainActor
final class SpeechStore {
    enum Mode { case idle, speaking, paused }

    private(set) var mode: Mode = .idle
    private(set) var title = ""
    private(set) var subtitle = ""
    /// Which message is being read, so its own button can become a stop button.
    private(set) var sourceID: String?
    private(set) var elapsed: TimeInterval = 0
    private(set) var progress: Double = 0
    /// The markdown block being spoken, for the reader's highlight.
    private(set) var speakingBlock: Int?

    var isActive: Bool { mode != .idle }
    /// Surfaced by the reader bar when the Mac couldn't produce audio.
    var speechError: String?
    /// True while the Mac is rendering audio and nothing is audible yet.
    private(set) var isLoading = false
    /// Set when the Mac engine is playing: a real clip has a duration, so the
    /// bar can show a timeline and seek to a position instead of a sentence.
    private(set) var duration: TimeInterval = 0
    var canSeek: Bool { duration > 0 }
    /// Mirrors the stored speed so the bar redraws when it changes; the
    /// preference itself is plain UserDefaults and observes nothing.
    private(set) var rate = SpeechPrefs.rate

    /// Sends a synthesis request to the Mac. Wired by AppModel so the store
    /// stays unaware of the client.
    @ObservationIgnored var requestSpeech: ((_ reqId: String, _ text: String) -> Void)?
    @ObservationIgnored private var clip: SpeechClip?
    @ObservationIgnored private var pendingReqId: String?

    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private let forwarder = SpeechDelegate()
    @ObservationIgnored private var segments: [SpeechSegment] = []
    /// Characters before each segment, for the progress bar.
    @ObservationIgnored private var prefixChars: [Int] = []
    @ObservationIgnored private var totalChars = 0
    @ObservationIgnored private var index = 0
    @ObservationIgnored private var charsInCurrent = 0
    @ObservationIgnored private var elapsedAtSegmentStart: TimeInterval = 0
    @ObservationIgnored private var ticker: Task<Void, Never>?
    /// Bumped on every stop or restart. Callbacks for a superseded run carry an old
    /// generation and are ignored, so a cancel never clobbers the run that replaced
    /// it.
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var utterances: [ObjectIdentifier: (generation: Int, index: Int)] = [:]
    /// The in-flight Settings voice sample, which belongs to no reading session.
    @ObservationIgnored private var previewUtterance: ObjectIdentifier?

    init() {
        forwarder.store = self
        synthesizer.delegate = forwarder
        observeInterruptions()
        configureRemoteCommands()
    }

    // MARK: playback

    /// Start reading `markdown`, or stop if this source is already being read.
    func toggle(id: String, title: String, subtitle: String, markdown: String) {
        if sourceID == id, isActive {
            stop()
            return
        }
        let segs = SpeechText.segments(markdown)
        guard !segs.isEmpty else {
            Haptics.warning()
            return
        }
        stop()
        rate = SpeechPrefs.rate // Settings can have moved it since the last reading

        if SpeechPrefs.engine == "mac" {
            // The Mac renders the whole document in one clip, so nothing reports
            // per-word timing. Keeping the segments anyway lets playback position
            // map back to a block by character offset — approximate, but at block
            // granularity a second of drift rarely crosses a paragraph.
            segments = segs
            prefixChars = segs.reduce(into: [0]) { acc, s in acc.append(acc[acc.count - 1] + s.text.count) }
            totalChars = max(1, prefixChars[prefixChars.count - 1])
            let text = segs.map(\.text).joined(separator: " ")
            let reqId = UUID().uuidString
            pendingReqId = reqId
            self.title = title
            self.subtitle = subtitle
            sourceID = id
            elapsed = 0
            progress = 0
            isLoading = true
            mode = .speaking
            Haptics.tap()
            updateNowPlaying()
            requestSpeech?(reqId, text)
            return
        }

        segments = segs
        prefixChars = segs.reduce(into: [0]) { acc, s in acc.append(acc[acc.count - 1] + s.text.count) }
        totalChars = max(1, prefixChars[prefixChars.count - 1])
        self.title = title
        self.subtitle = subtitle
        sourceID = id
        elapsed = 0
        Haptics.tap()
        activateSession()
        speak(from: 0)
        startTicker()
    }

    /// Speak a short sample in `voiceId` so a voice can be auditioned before it is
    /// chosen. Deliberately outside the reading state machine: no segments, no
    /// source, so `isActive` stays false and the reader bar doesn't flash up for a
    /// two-second sample.
    func preview(voiceId: String) {
        stop()
        let utterance = AVSpeechUtterance(string: Self.previewText)
        utterance.voice = AVSpeechSynthesisVoice(identifier: voiceId) ?? SpeechPrefs.voice()
        utterance.rate = SpeechPrefs.utteranceRate(SpeechPrefs.rate)
        previewUtterance = ObjectIdentifier(utterance)
        activateSession()
        synthesizer.speak(utterance)
    }

    private static let previewText = "This is how your automation replies will sound."

    /// The Mac's answer to a `requestSpeech`. Replies for a superseded request
    /// are dropped — the user may have started reading something else.
    func receiveSpeech(reqId: String, audio: String?, error: String?) {
        guard reqId == pendingReqId else { return }
        pendingReqId = nil
        isLoading = false
        guard let audio, let data = Data(base64Encoded: audio) else {
            speechError = error ?? "Couldn't synthesize speech."
            stop()
            return
        }
        let clip = SpeechClip { [weak self] in self?.stop() }
        do {
            try clip.load(data, rate: SpeechPrefs.rate)
        } catch {
            speechError = "Couldn't play the audio the Mac sent back."
            stop()
            return
        }
        activateSession()
        self.clip = clip
        duration = clip.duration
        clip.play()
        mode = .speaking
        startTicker()
        updateNowPlaying()
    }

    func stop() {
        generation += 1
        utterances = [:]
        previewUtterance = nil
        ticker?.cancel()
        ticker = nil
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
        clip?.stop()
        clip = nil
        pendingReqId = nil
        isLoading = false
        duration = 0
        segments = []
        prefixChars = []
        index = 0
        charsInCurrent = 0
        progress = 0
        elapsed = 0
        speakingBlock = nil
        sourceID = nil
        title = ""
        subtitle = ""
        mode = .idle
        clearNowPlaying()
        deactivateSession()
    }

    func togglePause() {
        switch mode {
        case .speaking: pause()
        case .paused: resume()
        case .idle: break
        }
    }

    /// Move by whole segments. Going back mid-sentence restarts the current one
    /// first, which is what "previous" means everywhere else.
    func skip(_ delta: Int) {
        // A rendered clip has a timeline, so skip means seconds, not sentences.
        if let clip {
            clip.seek(by: TimeInterval(delta) * 15)
            refreshClipProgress()
            return
        }
        guard isActive, !segments.isEmpty else { return }
        var target = index + delta
        if delta < 0, elapsed - elapsedAtSegmentStart > 3 { target = index }
        speak(from: max(0, min(segments.count - 1, target)))
        if mode == .paused { mode = .speaking; startTicker() }
        updateNowPlaying()
    }

    /// Scrub to a position. Only meaningful on the Mac engine.
    func seek(to time: TimeInterval) {
        guard let clip else { return }
        clip.seek(to: time)
        refreshClipProgress()
    }

    private func refreshClipProgress() {
        guard let clip else { return }
        elapsed = clip.currentTime
        duration = clip.duration
        progress = clip.duration > 0 ? min(1, clip.currentTime / clip.duration) : 0
        speakingBlock = blockAt(progress)
    }

    /// Which block a fraction through the clip lands in, by character offset.
    /// Assumes a roughly uniform speaking rate — the only option when the engine
    /// reports no timings.
    private func blockAt(_ fraction: Double) -> Int? {
        guard !segments.isEmpty, totalChars > 0 else { return nil }
        let target = Double(totalChars) * min(max(0, fraction), 1)
        var seen = 0
        for segment in segments {
            seen += segment.text.count
            if Double(seen) >= target { return segment.blockID }
        }
        return segments.last?.blockID
    }

    func setRate(_ rate: Double) {
        SpeechPrefs.rate = rate
        self.rate = rate
        guard isActive else { return }
        // A clip changes speed in place. Re-queueing utterances here instead would
        // start the on-device voice over the top of the audio already playing.
        if let clip {
            clip.setRate(rate)
            return
        }
        speak(from: index) // rate is fixed per utterance, so re-queue from here
        if mode == .paused { mode = .speaking; startTicker() }
    }

    private func pause() {
        guard mode == .speaking else { return }
        if let clip {
            clip.pause()
            mode = .paused
            ticker?.cancel()
            ticker = nil
            updateNowPlaying()
            return
        }
        synthesizer.pauseSpeaking(at: .word)
        mode = .paused
        ticker?.cancel()
        ticker = nil
        updateNowPlaying()
    }

    private func resume() {
        guard mode == .paused else { return }
        activateSession()
        if let clip {
            clip.play()
            mode = .speaking
            startTicker()
            updateNowPlaying()
            return
        }
        synthesizer.continueSpeaking()
        mode = .speaking
        startTicker()
        updateNowPlaying()
    }

    /// Queue every remaining segment at once and let the synthesizer run them back
    /// to back; a jump re-queues from the new position.
    private func speak(from start: Int) {
        generation += 1
        utterances = [:]
        if synthesizer.isSpeaking || synthesizer.isPaused {
            synthesizer.stopSpeaking(at: .immediate)
        }
        index = start
        charsInCurrent = 0
        elapsedAtSegmentStart = elapsed
        speakingBlock = segments.indices.contains(start) ? segments[start].blockID : nil
        updateProgress()

        let voice = SpeechPrefs.voice()
        let rate = SpeechPrefs.utteranceRate(SpeechPrefs.rate)
        for i in start..<segments.count {
            let utterance = AVSpeechUtterance(string: segments[i].text)
            utterance.voice = voice
            utterance.rate = rate
            utterance.postUtteranceDelay = segments[i].pause
            utterances[ObjectIdentifier(utterance)] = (generation, i)
            synthesizer.speak(utterance)
        }
        mode = .speaking
        updateNowPlaying()
    }

    private func startTicker() {
        ticker?.cancel()
        ticker = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 500_000_000)
                guard let self, !Task.isCancelled else { return }
                if self.mode == .speaking {
                    if self.clip != nil { self.refreshClipProgress() } else { self.elapsed += 0.5 }
                }
            }
        }
    }

    // MARK: synthesizer callbacks

    fileprivate func didStart(_ utterance: AVSpeechUtterance) {
        guard let info = utterances[ObjectIdentifier(utterance)], info.generation == generation else { return }
        index = info.index
        charsInCurrent = 0
        elapsedAtSegmentStart = elapsed
        speakingBlock = segments.indices.contains(info.index) ? segments[info.index].blockID : nil
        updateProgress()
    }

    fileprivate func willSpeak(range: NSRange, utterance: AVSpeechUtterance) {
        guard let info = utterances[ObjectIdentifier(utterance)], info.generation == generation else { return }
        charsInCurrent = range.location + range.length
        updateProgress()
    }

    fileprivate func didFinish(_ utterance: AVSpeechUtterance) {
        if previewUtterance == ObjectIdentifier(utterance) {
            previewUtterance = nil
            if mode == .idle { deactivateSession() } // hand audio back to whatever was playing
            return
        }
        guard let info = utterances[ObjectIdentifier(utterance)], info.generation == generation else { return }
        guard info.index == segments.count - 1 else { return }
        stop()
    }

    private func updateProgress() {
        guard !segments.isEmpty, prefixChars.indices.contains(index) else {
            progress = 0
            return
        }
        let spoken = prefixChars[index] + min(charsInCurrent, segments[index].text.count)
        progress = min(1, Double(spoken) / Double(totalChars))
    }

    // MARK: audio session

    /// `.playback` keeps reading with the screen locked and ignores the ringer
    /// switch; `.spokenAudio` is what tells the system this is speech, so other
    /// audio pauses rather than ducking under it. Activated only while reading, so
    /// merely opening the app never interrupts the user's music.
    private func activateSession() {
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [])
        try? session.setActive(true)
    }

    private func deactivateSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func observeInterruptions() {
        let center = NotificationCenter.default
        center.addObserver(forName: AVAudioSession.interruptionNotification,
                           object: nil, queue: .main) { [weak self] note in
            MainActor.assumeIsolated { self?.handleInterruption(note) }
        }
        center.addObserver(forName: AVAudioSession.routeChangeNotification,
                           object: nil, queue: .main) { [weak self] note in
            MainActor.assumeIsolated { self?.handleRouteChange(note) }
        }
    }

    private func handleInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            pause()
        case .ended:
            let options = (note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt).map {
                AVAudioSession.InterruptionOptions(rawValue: $0)
            }
            if options?.contains(.shouldResume) == true { resume() }
        @unknown default:
            break
        }
    }

    /// Headphones pulled out: pause instead of blasting the result from the
    /// speaker.
    private func handleRouteChange(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        pause()
    }

    // MARK: lock screen

    private func configureRemoteCommands() {
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in
            guard let self, self.mode == .paused else { return .commandFailed }
            self.resume()
            return .success
        }
        center.pauseCommand.addTarget { [weak self] _ in
            guard let self, self.mode == .speaking else { return .commandFailed }
            self.pause()
            return .success
        }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self, self.isActive else { return .commandFailed }
            self.togglePause()
            return .success
        }
        center.stopCommand.addTarget { [weak self] _ in
            guard let self, self.isActive else { return .commandFailed }
            self.stop()
            return .success
        }
        center.nextTrackCommand.addTarget { [weak self] _ in
            guard let self, self.isActive else { return .commandFailed }
            self.skip(1)
            return .success
        }
        center.previousTrackCommand.addTarget { [weak self] _ in
            guard let self, self.isActive else { return .commandFailed }
            self.skip(-1)
            return .success
        }
    }

    /// No duration is knowable up front, so the lock screen is told this is a live
    /// stream — otherwise it renders a scrubber that can't be honored.
    private func updateNowPlaying() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: subtitle,
            MPNowPlayingInfoPropertyIsLiveStream: true,
            MPNowPlayingInfoPropertyPlaybackRate: mode == .speaking ? 1.0 : 0.0,
        ]
    }

    private func clearNowPlaying() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}

/// AVSpeechSynthesizerDelegate is not main-actor bound, so callbacks land here and
/// hop to the store rather than forcing the store off its actor.
private final class SpeechDelegate: NSObject, AVSpeechSynthesizerDelegate {
    weak var store: SpeechStore?

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didStart utterance: AVSpeechUtterance) {
        Task { @MainActor [store] in store?.didStart(utterance) }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           willSpeakRangeOfSpeechString characterRange: NSRange,
                           utterance: AVSpeechUtterance) {
        Task { @MainActor [store] in store?.willSpeak(range: characterRange, utterance: utterance) }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [store] in store?.didFinish(utterance) }
    }
}
