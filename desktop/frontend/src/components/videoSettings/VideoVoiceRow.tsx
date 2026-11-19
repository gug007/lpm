import type { VideoNarrator } from "../../store/settings";
import { useOpenAiVoices } from "../../hooks/useOpenAiVoices";
import { KOKORO_VOICES } from "../../kokoroVoices";
import { SettingsRow } from "../SettingsRow";
import { SettingsSelect } from "../SettingsSelect";
import { LOCAL_COMMANDS } from "../settings/machineCommands";

// The narrator's voice: one of Kokoro's on this Mac, or one of OpenAI's.
export function VideoVoiceRow({
  narrator,
  value,
  onChange,
}: {
  narrator: VideoNarrator;
  value: string;
  onChange: (voice: string) => void;
}) {
  const cloudVoices = useOpenAiVoices(LOCAL_COMMANDS, narrator === "openai");
  const voices = narrator === "openai" ? cloudVoices : KOKORO_VOICES;
  const options = voices.includes(value) ? voices : [value, ...voices];

  return (
    <SettingsRow
      label="Voice"
      description={narrator === "openai" ? "gpt-4o-mini-tts · speaks most languages" : "Kokoro · English only"}
    >
      <SettingsSelect value={value} onChange={(e) => onChange(e.target.value)} aria-label="Voice">
        {options.map((voice) => (
          <option key={voice} value={voice}>
            {voice}
          </option>
        ))}
      </SettingsSelect>
    </SettingsRow>
  );
}
