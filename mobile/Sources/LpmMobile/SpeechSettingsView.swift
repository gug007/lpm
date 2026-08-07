import AVFoundation
import SwiftUI

/// The read-aloud settings page: speed, the installed-voice list, and a sample.
/// Selecting a voice or a speed plays the sample immediately — a list of names
/// says nothing about how any of them sound.
struct SpeechSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage(SpeechPrefs.voiceKey) private var voiceId = ""
    @AppStorage(SpeechPrefs.rateKey) private var rate = SpeechPrefs.defaultRate

    private var voices: [AVSpeechSynthesisVoice] { SpeechPrefs.installedVoices() }

    /// True when every installed voice is a basic one. The better voices are a
    /// system download this app cannot trigger, so all it can do is say so.
    private var onlyBasicVoices: Bool {
        guard let best = voices.first else { return false }
        return SpeechPrefs.qualityLabel(best) == nil
    }

    var body: some View {
        Form {
            Section {
                Picker("Speed", selection: $rate) {
                    ForEach(SpeechPrefs.rates, id: \.self) { r in
                        Text(SpeechPrefs.rateLabel(r)).tag(r)
                    }
                }
                Button {
                    model.speech.preview(voiceId: voiceId)
                } label: {
                    Label("Hear a sample", systemImage: "play.circle")
                }
            } footer: {
                Text("Voice and speed for reading automation replies out loud.")
            }

            Section {
                Picker("Voice", selection: $voiceId) {
                    Text("Best available").tag("")
                    ForEach(voices, id: \.identifier) { voice in
                        HStack {
                            Text(voice.name)
                            if let quality = SpeechPrefs.qualityLabel(voice) {
                                Text(quality)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .tag(voice.identifier)
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            } header: {
                Text("Voice")
            }

            if onlyBasicVoices {
                Section {
                    Label {
                        Text("Your installed voices are all basic ones. Download a "
                             + "Premium voice in Settings → Accessibility → Spoken "
                             + "Content → Voices for much more natural speech.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } icon: {
                        Image(systemName: "waveform.badge.exclamationmark")
                            .foregroundStyle(.orange)
                    }
                }
            }
        }
        .navigationTitle("Read aloud")
        .navigationBarTitleDisplayMode(.inline)
        .onChange(of: voiceId) { _, id in model.speech.preview(voiceId: id) }
        .onChange(of: rate) { _, _ in model.speech.preview(voiceId: voiceId) }
    }
}
