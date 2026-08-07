import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ClearOpenAIKey,
  HasOpenAIKey,
  OpenAIVoices,
  SetOpenAIKey,
} from "../../bridge/commands";
import { SettingsRow } from "./Settings";
import { SettingsSelect } from "./SettingsSelect";
import { BTN_SECONDARY } from "./ui/buttons";

/// The key lives in the macOS Keychain (a 0600 file on a Linux host), never in
/// settings.json — so this row can ask whether one is saved, but never reads it
/// back. Once saved, the field shows a placeholder and the only actions are
/// replace or remove.
export function OpenAIKeyRow() {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  useEffect(() => {
    HasOpenAIKey()
      .then((has: boolean) => setSaved(Boolean(has)))
      .catch(() => setSaved(false));
  }, []);

  const save = async () => {
    try {
      await SetOpenAIKey(value.trim());
      setValue("");
      setEditing(false);
      setSaved(true);
      toast.success("OpenAI key saved to the Keychain");
    } catch (err) {
      toast.error(`Couldn't save key: ${String(err)}`);
    }
  };

  const clear = async () => {
    try {
      await ClearOpenAIKey();
      setSaved(false);
      toast.success("OpenAI key removed");
    } catch (err) {
      toast.error(`Couldn't remove key: ${String(err)}`);
    }
  };

  const description =
    saved === null
      ? "Checking…"
      : saved
        ? "Saved in the Keychain"
        : "Required for the OpenAI engine";

  return (
    <SettingsRow id="tts.openaiKey" label="OpenAI API Key" description={description}>
      {editing || saved === false ? (
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && value.trim()) save();
            }}
            placeholder="sk-…"
            aria-label="OpenAI API key"
            autoComplete="off"
            spellCheck={false}
            className="w-56 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-sm"
          />
          <button onClick={save} disabled={!value.trim()} className={BTN_SECONDARY}>
            Save
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(true)} className={BTN_SECONDARY}>
            Replace
          </button>
          <button onClick={clear} className={BTN_SECONDARY}>
            Remove
          </button>
        </div>
      )}
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
  const [voices, setVoices] = useState<string[]>([]);

  useEffect(() => {
    OpenAIVoices()
      .then((v: string[]) => setVoices(Array.isArray(v) ? v : []))
      .catch(() => setVoices([]));
  }, []);

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
