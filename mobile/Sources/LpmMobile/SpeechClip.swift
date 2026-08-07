import AVFoundation

/// Playback for pre-rendered audio (the Mac's OpenAI engine), as opposed to the
/// on-device synthesizer. Because this is a real file with a known duration, it
/// supports what a speech synthesizer cannot: seeking to an arbitrary time.
@MainActor
final class SpeechClip {
    private var player: AVAudioPlayer?
    private let onFinish: () -> Void
    private let delegate = ClipDelegate()

    init(onFinish: @escaping () -> Void) {
        self.onFinish = onFinish
        delegate.onFinish = { [onFinish] in onFinish() }
    }

    var duration: TimeInterval { player?.duration ?? 0 }
    var currentTime: TimeInterval { player?.currentTime ?? 0 }
    var isPlaying: Bool { player?.isPlaying ?? false }

    /// `enableRate` has to be set before `prepareToPlay`, so the speed preference
    /// is applied here rather than the first time the user opens the speed menu.
    func load(_ data: Data, rate: Double) throws {
        let p = try AVAudioPlayer(data: data)
        p.delegate = delegate
        p.enableRate = true
        p.prepareToPlay()
        p.rate = Self.clamped(rate)
        player = p
    }

    /// The phone's speed preference. The Mac renders at its own configured speed,
    /// so this is what makes the bar's control mean anything on that engine — and
    /// it changes speed without a re-render round trip.
    func setRate(_ rate: Double) {
        player?.rate = Self.clamped(rate)
    }

    /// AVAudioPlayer only guarantees 0.5x–2x.
    private static func clamped(_ rate: Double) -> Float {
        Float(min(2, max(0.5, rate)))
    }

    func play() { player?.play() }
    func pause() { player?.pause() }

    func stop() {
        player?.stop()
        player = nil
    }

    /// Clamped so a seek past the end doesn't silently stop playback.
    func seek(to time: TimeInterval) {
        guard let player else { return }
        player.currentTime = min(max(0, time), max(0, player.duration - 0.05))
    }

    func seek(by delta: TimeInterval) {
        guard let player else { return }
        seek(to: player.currentTime + delta)
    }
}

/// AVAudioPlayerDelegate is not main-actor bound, so the callback hops back.
private final class ClipDelegate: NSObject, AVAudioPlayerDelegate {
    var onFinish: (() -> Void)?

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [onFinish] in onFinish?() }
    }
}
