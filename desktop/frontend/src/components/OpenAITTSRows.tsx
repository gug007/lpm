import { useEffect, useState } from "react";
import { useOpenAiVoices } from "../hooks/useOpenAiVoices";
import { isMac } from "../platform";
import { OpenAIKeyField } from "./OpenAIKeyField";
import { useSettingsTarget } from "./settings/settingsTarget";
import { SettingsRow } from "./SettingsRow";
import { SettingsSelect } from "./SettingsSelect";

/// The key lives in the macOS Keychain (a 0600 file on a Linux host), never in
/// settings.json — so this row can ask whether one is saved, but never reads it
/// back. Once saved, the field shows a placeholder and the only actions are
/// replace or remove.
export function OpenAIKeyRow() {
  const { machine, commands } = useSettingsTarget();
  const [saved, setSaved] = useState<boolean | null>(null);
  const keychain = machine.kind === "local" ? isMac : machine.mac;
  const where = machine.kind === "local" ? "on this computer" : `on ${machine.name}`;

  useEffect(() => {
    commands
      .hasOpenAiKey()
      .then(setSaved)
      .catch(() => setSaved(false));
  }, [commands]);

  const description =
    saved === null
      ? "Checking…"
      : saved
        ? keychain
          ? "Saved in the Keychain"
          : `Saved ${where}`
        : "Required for the OpenAI engine";

  return (
    <SettingsRow id="tts.openaiKey" label="OpenAI API Key" description={description}>
      <OpenAIKeyField
        saved={saved}
        onSave={(key) => commands.setOpenAiKey(key).then(() => setSaved(true))}
        onClear={() => commands.clearOpenAiKey().then(() => setSaved(false))}
      />
    </SettingsRow>
  );
}

export function OpenAIVoiceRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (voice: string) => void;
}) {
  const { commands } = useSettingsTarget();
  const voices = useOpenAiVoices(commands);

  return (
    <SettingsRow id="tts.openaiVoice" label="OpenAI Voice" description="OpenAI voice">
      <SettingsSelect
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="OpenAI voice"
      >
        {voices.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </SettingsSelect>
    </SettingsRow>
  );
}
