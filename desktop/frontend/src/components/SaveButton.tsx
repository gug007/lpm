import { primaryHint } from "../shortcutHints";
import { BTN_PRIMARY } from "./ui/buttons";

// An editor's Save, with its ⌘S shortcut inside the button.
export function SaveButton({
  saving,
  disabled = false,
  onSave,
}: {
  saving: boolean;
  disabled?: boolean;
  onSave: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={saving || disabled}
      className={`${BTN_PRIMARY} inline-flex items-center gap-2`}
    >
      {saving ? "Saving…" : "Save"}
      {!saving && <span className="text-[11px] opacity-55">{primaryHint("s")}</span>}
    </button>
  );
}
