import { VideoClearOpenAIKey, VideoSetOpenAIKey } from "../../../bridge/commands";
import { OpenAIKeyField } from "../OpenAIKeyField";
import { SettingsRow } from "../SettingsRow";

// Videos' own key, in the Keychain item explaincast reads: separate from Text
// to Speech's, so each can be billed and removed on its own. Shown only for the
// cloud voice, which can't speak without it.
export function VideoOpenAIKeyRow({ saved, onChange }: { saved: boolean | null; onChange: () => void }) {
  const description =
    saved === false ? (
      <span className="flex flex-wrap items-center gap-x-1.5">
        <span className="rounded-full bg-[color-mix(in_srgb,var(--accent-amber)_14%,transparent)] px-2 py-px text-[10.5px] font-semibold text-[var(--accent-amber-text)]">
          Needed
        </span>
        For videos only. OpenAI bills this key.
      </span>
    ) : saved ? (
      "Saved in the Keychain, for videos only"
    ) : (
      "For videos only"
    );

  return (
    <SettingsRow label="OpenAI API key" description={description}>
      <OpenAIKeyField
        saved={saved}
        autoFocus={saved === false}
        onSave={(key) => VideoSetOpenAIKey(key).then(onChange)}
        onClear={() => VideoClearOpenAIKey().then(onChange)}
      />
    </SettingsRow>
  );
}
