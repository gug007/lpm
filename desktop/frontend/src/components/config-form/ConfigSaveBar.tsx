import type { ReactNode } from "react";
import { SaveButton } from "../SaveButton";
import { BTN_SECONDARY } from "../ui/buttons";
import { SUBPAGE_COLUMN } from "../project-detail/ProjectSubpage";

interface ConfigSaveBarProps {
  dirty: boolean;
  saving: boolean;
  invalid: boolean;
  // The file's problem, with its go-to and AI fix, shown beside the bar.
  notice?: ReactNode;
  onDiscard: () => void;
  onSave: () => void;
}

// Floats over the editor's bottom edge while there's something to say: what
// isn't saved yet, with Discard and Save (its shortcut inside), and any
// problem the file has.
export function ConfigSaveBar({ dirty, saving, invalid, notice, onDiscard, onSave }: ConfigSaveBarProps) {
  if (!dirty && !notice) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10">
      <div className={`${SUBPAGE_COLUMN} flex items-end justify-end gap-2 [&>*]:pointer-events-auto`}>
        {notice}
        {dirty && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 pl-3.5 shadow-xl">
            <span className="mr-1 text-[12px] text-[var(--accent-amber)]">Unsaved changes</span>
            <button type="button" onClick={onDiscard} disabled={saving} className={BTN_SECONDARY}>
              Discard
            </button>
            <SaveButton saving={saving} disabled={invalid} onSave={onSave} />
          </div>
        )}
      </div>
    </div>
  );
}
