import { VideoClearOpenAIKey, VideoSetOpenAIKey } from "../../../bridge/commands";
import { OpenAIKeyField } from "../OpenAIKeyField";
import { SettingsRow } from "../SettingsRow";

// Videos' own key, in the Keychain item explaincast reads: separate from Text
// to Speech's, so each can be billed and removed on its own.
export function VideoOpenAIKeyRow({
  saved,
  needed,
  onChange,
}: {
  saved: boolean;
  // The cloud voice is the narrator, so videos can't be voiced without it.
  needed: boolean;
  onChange: () => void;
}) {
  const description = saved
    ? "Saved in the Keychain, for videos only"
    : needed
      ? "Needed for the cloud voice. Billed by OpenAI to this key"
      : "Only needed for the cloud voice";

  return (
    <SettingsRow label="OpenAI API key" description={description}>
      <OpenAIKeyField
        saved={saved}
        onSave={(key) => VideoSetOpenAIKey(key).then(onChange)}
        onClear={() => VideoClearOpenAIKey().then(onChange)}
      />
    </SettingsRow>
  );
}
