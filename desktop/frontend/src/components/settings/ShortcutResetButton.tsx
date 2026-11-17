import { RotateCcw } from "lucide-react";
import { Tooltip } from "../ui/Tooltip";

// Puts a changed shortcut back to the one lpm ships with.
export function ShortcutResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip content="Back to the default">
      <button
        type="button"
        onClick={onClick}
        aria-label="Reset to the default shortcut"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]"
      >
        <RotateCcw size={13} />
      </button>
    </Tooltip>
  );
}
