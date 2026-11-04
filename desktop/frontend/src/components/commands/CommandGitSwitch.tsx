import { EyeOff } from "lucide-react";
import { FIELD_CLASS } from "../ui/fields";
import { Switch } from "../ui/Switch";

interface CommandGitSwitchProps {
  checked: boolean;
  note: string | null;
  onChange: (checked: boolean) => void;
}

// A project skill normally travels with its code; this one stays put. Sits above
// the prompt, which takes up the slack, so it's in view at any window height.
export function CommandGitSwitch({ checked, note, onChange }: CommandGitSwitchProps) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`${FIELD_CLASS} flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--bg-hover)]`}
      >
        <EyeOff size={14} className={checked ? "text-[var(--accent-cyan)]" : "text-[var(--text-muted)]"} />
        <span className="min-w-0 flex-1 truncate">
          Keep out of Git
          <span className="ml-2 text-[var(--text-muted)]">Stays in the project folder and is never committed.</span>
        </span>
        <Switch checked={checked} />
      </button>
      {note && <p className="text-[11.5px] leading-relaxed text-[var(--accent-amber-text)]">{note}</p>}
    </div>
  );
}
