import type { VideoNarrator } from "../../store/settings";
import { useOpenAiVoices } from "../../hooks/useOpenAiVoices";
import { useVoiceSample } from "../../hooks/useVoiceSample";
import { KOKORO_VOICES } from "../../kokoroVoices";
import { videoVoiceName, videoVoiceShortName } from "../../videoVoice";
import { SettingsRow } from "../SettingsRow";
import { SettingsSelect } from "../SettingsSelect";
import { LOCAL_COMMANDS } from "../settings/machineCommands";
import { VideoVoiceSampleButton } from "./VideoVoiceSampleButton";

// The narrator's voice, listed by name and accent, with a sample to hear it:
// one of Kokoro's on this Mac, or one of OpenAI's.
export function VideoVoiceRow({
  narrator,
  value,
  onChange,
  sampleUnavailable,
}: {
  narrator: VideoNarrator;
  value: string;
  onChange: (voice: string) => void;
  sampleUnavailable: string | null;
}) {
  const cloudVoices = useOpenAiVoices(LOCAL_COMMANDS, narrator === "openai");
  const { sample, play, stop } = useVoiceSample();
  const voices = narrator === "openai" ? cloudVoices : KOKORO_VOICES;
  const options = voices.includes(value) ? voices : [value, ...voices];
  const name = videoVoiceShortName(narrator, value);

  return (
    <SettingsRow label="Voice" description={narrator === "openai" ? "gpt-4o-mini-tts" : "Kokoro, on this Mac"}>
      <div className="flex items-center gap-1.5">
        <VideoVoiceSampleButton
          voice={`${narrator}/${value}`}
          name={name}
          sample={sample}
          unavailable={sampleUnavailable}
          onPlay={play}
          onStop={stop}
        />
        <SettingsSelect
          value={value}
          onChange={(e) => {
            stop();
            onChange(e.target.value);
          }}
          aria-label="Voice"
        >
          {options.map((voice) => (
            <option key={voice} value={voice}>
              {videoVoiceName(narrator, voice)}
            </option>
          ))}
        </SettingsSelect>
      </div>
    </SettingsRow>
  );
}
