import { Check, WandSparkles } from "lucide-react";
import { formatShortcutLabel } from "../monacoYamlFormat";
import { SaveButton } from "./SaveButton";
import { Tooltip } from "./ui/Tooltip";
import { BTN_SECONDARY } from "./ui/buttons";

// An editor's save row: "Saved" while clean; once edited, "Unsaved changes"
// with Save (and Discard where the editor can throw edits away).
export function EditorSaveBar({
  dirty,
  saving,
  error,
  invalid = false,
  onFormat,
  onDiscard,
  onSave,
}: {
  dirty: boolean;
  saving: boolean;
  error: string | null | undefined;
  invalid?: boolean;
  onFormat?: () => void;
  onDiscard?: () => void;
  onSave: () => void;
}) {
  const pending = dirty || saving;
  return (
    <div className="flex h-11 shrink-0 items-center gap-2">
      <div className="min-w-0 flex-1">
        {error ? (
          <span className="block truncate text-[12px] text-[var(--accent-red)]" title={error}>
            {error}
          </span>
        ) : pending ? (
          <span className="text-[12px] text-[var(--accent-amber)]">Unsaved changes</span>
        ) : (
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)]">
            <Check size={13} strokeWidth={2.4} className="text-[var(--accent-green)]" />
            Saved
          </span>
        )}
      </div>
      {onFormat && (
        <Tooltip content={`Re-indent the YAML (${formatShortcutLabel()})`} side="top" disabled={invalid}>
          <button
            type="button"
            onClick={onFormat}
            disabled={invalid}
            className={`${BTN_SECONDARY} inline-flex items-center gap-1.5`}
          >
            <WandSparkles size={13} />
            Format
          </button>
        </Tooltip>
      )}
      {pending && (
        <>
          {onDiscard && (
            <button type="button" onClick={onDiscard} disabled={saving} className={BTN_SECONDARY}>
              Discard
            </button>
          )}
          <SaveButton saving={saving} disabled={invalid} onSave={onSave} />
        </>
      )}
    </div>
  );
}
