import { BrowserOpenURL } from "../../../bridge/runtime";
import { GET_KEY_URL, type GenerateProvider } from "../../generate";
import { rowProps, type SettingsRowId } from "../../settings-registry";
import { OpenAIKeyField } from "../OpenAIKeyField";
import { SettingsRow } from "../SettingsRow";
import { useSettingsTarget } from "./settingsTarget";

// A provider's key on the machine Settings shows: saved there, never read back.
export function GenerateKeyRow({
  id,
  provider,
  placeholder,
  saved,
  onChange,
}: {
  id: SettingsRowId;
  provider: GenerateProvider;
  placeholder: string;
  saved: boolean | null;
  onChange: () => void;
}) {
  const { machine, commands } = useSettingsTarget();
  const row = rowProps(id);
  const where = machine.kind === "local" ? "this computer" : machine.name;
  const description =
    saved === null ? "Checking…" : saved ? `${row.description}. Saved on ${where}` : row.description;

  return (
    <SettingsRow
      id={row.id}
      label={row.label}
      description={description}
      below={
        saved === false ? (
          <button
            type="button"
            onClick={() => BrowserOpenURL(GET_KEY_URL[provider])}
            className="mt-0.5 text-[11px] text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Get a key
          </button>
        ) : undefined
      }
    >
      <OpenAIKeyField
        saved={saved}
        placeholder={placeholder}
        label={`${row.label} API key`}
        onSave={(key) => commands.generate.setKey(provider, key).then(onChange)}
        onClear={() => commands.generate.clearKey(provider).then(onChange)}
      />
    </SettingsRow>
  );
}
