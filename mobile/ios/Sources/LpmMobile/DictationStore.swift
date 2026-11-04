import AVFoundation
import SwiftUI
import UIKit

/// The app's one recorder. It belongs to the field that started a take, and lives
/// here rather than in a view so the words of a take still land in that field's
/// draft when the view goes away first.
@Observable @MainActor
final class DictationStore {
    enum Phase: Equatable {
        case idle
        case starting
        case recording
        case transcribing
        case failed(DictationFailure)
    }

    /// How long the mic ignores taps after a send: Send clears the field and the
    /// mic lands under the same thumb, so a double tap would otherwise start a take.
    private static let sendHoldOff: TimeInterval = 0.6

    private(set) var phase: Phase = .idle
    private(set) var owner: String?
    private(set) var startedAt: Date?
    /// The take's length once it stops counting.
    private(set) var length: TimeInterval = 0
    /// What the take has heard so far.
    private(set) var heard = ""

    @ObservationIgnored let meter = DictationMeter()
    @ObservationIgnored var makeEngine: @MainActor () -> DictationEngine = { SpeechDictationEngine() }
    /// Runs before the microphone opens: read-aloud can't share it.
    @ObservationIgnored var willRecord: (() -> Void)?

    @ObservationIgnored private var engine: DictationEngine?
    @ObservationIgnored private var insert: ((String) -> Void)?
    /// Bumped by every new or abandoned take, so a late answer from an older one is dropped.
    @ObservationIgnored private var take = 0
    @ObservationIgnored private var holdOffUntil = Date.distantPast

    init() {
        let center = NotificationCenter.default
        center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil,
                           queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.stop() }
        }
        center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let began = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                == AVAudioSession.InterruptionType.began.rawValue
            MainActor.assumeIsolated { if began { self?.stop() } }
        }
    }

    /// A take is under way in this field: it shows the recorder and a Stop.
    func isActive(_ owner: String) -> Bool {
        guard self.owner == owner else { return false }
        switch phase {
        case .starting, .recording, .transcribing: return true
        case .idle, .failed: return false
        }
    }

    func failure(_ owner: String) -> DictationFailure? {
        guard self.owner == owner, case .failed(let failure) = phase else { return nil }
        return failure
    }

    /// What this field's take has heard so far, shown until Stop puts it in the draft.
    func words(_ owner: String) -> String {
        self.owner == owner ? heard : ""
    }

    /// Start a take for `owner`; `insert` receives its words.
    func start(owner: String, insert: @escaping (String) -> Void) {
        guard Date() >= holdOffUntil else { return }
        switch phase {
        case .starting, .recording, .transcribing: return
        case .idle, .failed: break
        }
        take += 1
        let take = self.take
        self.owner = owner
        self.insert = insert
        startedAt = nil
        length = 0
        heard = ""
        phase = .starting
        willRecord?()
        let engine = makeEngine()
        self.engine = engine
        Haptics.tap()
        Task {
            let failure = await engine.start(meter: meter, heard: { words in
                if take == self.take { self.heard = words }
            }, finished: { result in
                self.ended(result, take: take)
            })
            guard take == self.take else {
                engine.cancel()
                return
            }
            if let failure {
                fail(failure)
            } else {
                startedAt = Date()
                phase = .recording
            }
        }
    }

    /// Stop listening and keep the words.
    func stop() {
        switch phase {
        case .recording:
            length = startedAt.map { Date().timeIntervalSince($0) } ?? 0
            phase = .transcribing
            Haptics.tap()
            engine?.stop()
        case .starting:
            cancel()
        case .idle, .transcribing, .failed:
            break
        }
    }

    /// Drop the take or its notice.
    func cancel() {
        take += 1
        engine?.cancel()
        reset()
    }

    /// The field left the screen: finish what it started rather than listen out of sight.
    func leave(_ owner: String) {
        guard self.owner == owner else { return }
        if failure(owner) != nil { cancel() } else { stop() }
    }

    /// A field that can't take the words after it leaves ends the take with it.
    func abandon(_ owner: String) {
        if self.owner == owner { cancel() }
    }

    func noteSent() {
        holdOffUntil = Date().addingTimeInterval(Self.sendHoldOff)
    }

    private func ended(_ result: Result<String, DictationFailure>, take: Int) {
        guard take == self.take else { return }
        switch result {
        case .success(let words):
            let insert = insert
            reset()
            insert?(words)
        case .failure(let failure):
            fail(failure)
        }
    }

    private func fail(_ failure: DictationFailure) {
        engine = nil
        heard = ""
        meter.level = 0
        phase = .failed(failure)
        Haptics.warning()
    }

    private func reset() {
        engine = nil
        insert = nil
        owner = nil
        startedAt = nil
        length = 0
        heard = ""
        meter.level = 0
        phase = .idle
    }
}
