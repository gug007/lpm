import AVFoundation
import SwiftUI

/// Phone-local read-aloud preferences: which installed voice to use and how fast
/// to talk. Nothing here syncs to the Mac — the voices are whatever this device
/// has downloaded, so the choice only makes sense locally.
enum SpeechPrefs {
    static let voiceKey = "speech.voiceId"
    static let rateKey = "speech.rate"

    static let defaultRate = 1.0
    static let rates: [Double] = [0.75, 1.0, 1.25, 1.5, 2.0]

    static var voiceId: String {
        get { UserDefaults.standard.string(forKey: voiceKey) ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: voiceKey) }
    }

    static var rate: Double {
        get {
            let stored = UserDefaults.standard.double(forKey: rateKey)
            return stored > 0 ? stored : defaultRate
        }
        set { UserDefaults.standard.set(newValue, forKey: rateKey) }
    }

    static func rateLabel(_ rate: Double) -> String {
        rate == rate.rounded() ? "\(Int(rate))x" : "\(rate)x"
    }

    /// The voice to speak with: the saved one if it is still installed, else the
    /// best-sounding voice for the phone's language. A saved voice can vanish when
    /// the user deletes it in iOS Settings, so falling back matters.
    static func voice() -> AVSpeechSynthesisVoice? {
        let saved = voiceId
        if !saved.isEmpty, let v = AVSpeechSynthesisVoice(identifier: saved) { return v }
        return installedVoices().first
    }

    /// Installed voices for the current language, best quality first. Two families
    /// are dropped: Siri voices, which appear in the list but silently substitute a
    /// different voice when a third-party app speaks them, and the legacy
    /// `speech.synthesis.voice` novelty set (Bells, Boing, Bad News) that the
    /// Simulator inherits from the host Mac.
    static func installedVoices() -> [AVSpeechSynthesisVoice] {
        let language = AVSpeechSynthesisVoice.currentLanguageCode()
        let prefix = String(language.prefix(2))
        return AVSpeechSynthesisVoice.speechVoices()
            .filter { $0.language.hasPrefix(prefix) }
            .filter { !$0.identifier.lowercased().contains("siri") }
            .filter { !$0.identifier.contains("speech.synthesis.voice") }
            .sorted {
                if $0.quality.rawValue != $1.quality.rawValue {
                    return $0.quality.rawValue > $1.quality.rawValue
                }
                if $0.language != $1.language { return $0.language == language }
                return $0.name < $1.name
            }
    }

    static func qualityLabel(_ voice: AVSpeechSynthesisVoice) -> String? {
        switch voice.quality {
        case .premium: return "Premium"
        case .enhanced: return "Enhanced"
        default: return nil
        }
    }

    /// The multiplier applied to the platform's normal speaking rate. The scale is
    /// not linear and the useful range is narrow, so the result is clamped.
    static func utteranceRate(_ multiplier: Double) -> Float {
        let scaled = Double(AVSpeechUtteranceDefaultSpeechRate) * multiplier
        let clamped = min(Double(AVSpeechUtteranceMaximumSpeechRate),
                          max(Double(AVSpeechUtteranceMinimumSpeechRate), scaled))
        return Float(clamped)
    }
}

/// Voice + speed rows for the app Settings sheet.
struct SpeechSettingsControls: View {
    @AppStorage(SpeechPrefs.voiceKey) private var voiceId = ""
    @AppStorage(SpeechPrefs.rateKey) private var rate = SpeechPrefs.defaultRate

    private var voices: [AVSpeechSynthesisVoice] { SpeechPrefs.installedVoices() }

    var body: some View {
        Picker("Voice", selection: $voiceId) {
            Text("Best available").tag("")
            ForEach(voices, id: \.identifier) { voice in
                if let quality = SpeechPrefs.qualityLabel(voice) {
                    Text("\(voice.name) · \(quality)").tag(voice.identifier)
                } else {
                    Text(voice.name).tag(voice.identifier)
                }
            }
        }
        Picker("Speed", selection: $rate) {
            ForEach(SpeechPrefs.rates, id: \.self) { r in
                Text(SpeechPrefs.rateLabel(r)).tag(r)
            }
        }
    }
}
