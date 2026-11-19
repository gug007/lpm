import { chordLabel } from "../../keys";
import { DEFAULT_KOKORO_VOICE, KOKORO_VOICES } from "../../kokoroVoices";
import { MACHINE } from "../../machineWords";
import { isMac } from "../../platform";
import { rowProps } from "../../settings-registry";
import { OpenAIKeyRow, OpenAIVoiceRow } from "../OpenAITTSRows";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SettingsSelect } from "../SettingsSelect";
import { Toggle } from "../ui/Toggle";
import { KokoroEngineRow } from "./KokoroEngineRow";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

const SPEEDS = [
  { value: 0.5, label: "0.5x" },
  { value: 0.75, label: "0.75x" },
  { value: 1.0, label: "1.0x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
  { value: 1.75, label: "1.75x" },
  { value: 2.0, label: "2.0x" },
  { value: 2.5, label: "2.5x" },
  { value: 3.0, label: "3.0x" },
];

export function TtsPane() {
  const { machine, settings, update } = useSettingsTarget();
  const shows = useRowReach();
  const enabled = settings.ttsEnabled ?? false;
  const openai = (settings.ttsEngine ?? "kokoro") === "openai";
  const kokoroWhere = machine.kind === "local" ? MACHINE.thisMachine : machine.name;

  return (
    <SettingsSection>
      <SettingsRow
        {...rowProps("tts.enable", {
          description: enabled
            ? `${isMac ? "Cmd+Shift+L" : chordLabel({ key: "l", meta: true, shift: true })} to read selected text`
            : "Read terminal text aloud using Kokoro",
        })}
      >
        <Toggle enabled={enabled} onChange={(v) => void update({ ttsEnabled: v })} />
      </SettingsRow>
      {enabled && (
        <>
          <SettingsRow {...rowProps("tts.engine")}>
            <SettingsSelect
              value={settings.ttsEngine ?? "kokoro"}
              onChange={(e) => void update({ ttsEngine: e.target.value })}
              aria-label="Engine"
            >
              <option value="kokoro">{`Kokoro (on ${kokoroWhere})`}</option>
              <option value="openai">OpenAI</option>
            </SettingsSelect>
          </SettingsRow>
          {openai ? (
            <>
              {shows("tts.openaiKey") && <OpenAIKeyRow />}
              <OpenAIVoiceRow
                value={settings.ttsOpenAiVoice ?? "alloy"}
                onChange={(v) => void update({ ttsOpenAiVoice: v })}
              />
            </>
          ) : (
            <SettingsRow {...rowProps("tts.voice")}>
              <SettingsSelect
                value={settings.ttsVoice ?? DEFAULT_KOKORO_VOICE}
                onChange={(e) => void update({ ttsVoice: e.target.value })}
                aria-label="Voice"
              >
                {KOKORO_VOICES.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </SettingsSelect>
            </SettingsRow>
          )}
          <SettingsRow {...rowProps("tts.speed")}>
            <SettingsSelect
              value={settings.ttsSpeed ?? 1.0}
              onChange={(e) => void update({ ttsSpeed: parseFloat(e.target.value) })}
              aria-label="Playback speed"
            >
              {SPEEDS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SettingsSelect>
          </SettingsRow>
          {!openai && shows("tts.kokoro") && <KokoroEngineRow />}
        </>
      )}
    </SettingsSection>
  );
}
