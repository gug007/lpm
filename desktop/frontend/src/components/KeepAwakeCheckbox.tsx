import { Check } from "lucide-react";

// A Keep awake option's checkbox: a soft gray box with a bright tick when on,
// an outlined square when off. Gray, not amber, so amber stays for what is live.
// Hovering anywhere on its row (a `group` label) brightens it.
export function KeepAwakeCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="relative inline-grid h-3.5 w-3.5 shrink-0 place-items-center">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[4px] border-[1.5px] bg-transparent outline-none transition-colors duration-150 not-checked:border-[var(--text-muted)]/70 not-checked:group-hover:border-[var(--text-secondary)] checked:border-transparent checked:bg-[var(--text-muted)]/45 checked:group-hover:bg-[var(--text-muted)]/60 focus-visible:ring-1 focus-visible:ring-[var(--accent-cyan)]/60"
      />
      <Check
        aria-hidden
        size={10}
        strokeWidth={3}
        className="pointer-events-none relative text-[var(--text-primary)] opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );
}
