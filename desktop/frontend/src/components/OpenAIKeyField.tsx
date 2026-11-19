import { useState } from "react";
import { useConfirmFlashFor } from "../hooks/useConfirmFlash";
import { toast } from "../notifications/toast";
import { BTN_SECONDARY } from "./ui/buttons";
import { ConfirmNote } from "./ui/ConfirmNote";

type Outcome = "Saved" | "Removed";

// A key that is stored but never read back: a field to type one in, then
// Replace or Remove once one is saved. `saved` is null while still unknown.
export function OpenAIKeyField({
  saved,
  onSave,
  onClear,
  autoFocus = false,
}: {
  saved: boolean | null;
  onSave: (key: string) => Promise<unknown>;
  onClear: () => Promise<unknown>;
  autoFocus?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [flashed, flash] = useConfirmFlashFor<Outcome>();

  const run = async (action: () => Promise<unknown>, outcome: Outcome) => {
    try {
      await action();
      setValue("");
      setEditing(false);
      flash(outcome);
    } catch (err) {
      toast.error(outcome === "Saved" ? "Couldn't save the key" : "Couldn't remove the key", {
        description: String(err),
      });
    }
  };
  const save = () => {
    const key = value.trim();
    if (key) void run(() => onSave(key), "Saved");
  };

  if (flashed) return <ConfirmNote>{flashed}</ConfirmNote>;
  if (editing || saved === false) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          placeholder="sk-…"
          aria-label="OpenAI API key"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="w-56 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-sm"
        />
        <button type="button" onClick={save} disabled={!value.trim()} className={BTN_SECONDARY}>
          Save
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => setEditing(true)} className={BTN_SECONDARY}>
        Replace
      </button>
      <button type="button" onClick={() => void run(onClear, "Removed")} className={BTN_SECONDARY}>
        Remove
      </button>
    </div>
  );
}
