import { Repeat } from "lucide-react";
import { Switch } from "./ui/Switch";

/** The checks menu's Keep fixing until green switch, above the Fix with …
 *  rows it changes: with it on, the agent picked gets each new failure until
 *  the checks pass. `note` is how the last loop ended, said once. */
export function CiFixLoopSwitch({
  checked,
  onChange,
  note,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  note?: string;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      title="Sends each new failure to the same agent after it pushes. Stops when checks pass, after 3 rounds, or when the agent asks you something."
      className="flex w-full min-w-0 items-center gap-2 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-hover)]"
    >
      <Repeat size={12} className="shrink-0 text-[var(--text-muted)]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">Keep fixing until green</span>
        {note && <span className="block truncate text-[10px] text-[var(--text-muted)]">{note}</span>}
      </span>
      <Switch checked={checked} />
    </button>
  );
}
