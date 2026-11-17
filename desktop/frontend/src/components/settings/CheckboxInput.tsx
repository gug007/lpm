import { Check } from "lucide-react";

// One checkbox for Settings: blue and ticked when on, an outlined square when off.
export function CheckboxInput({
  checked,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <span className="relative inline-grid h-4 w-4 shrink-0 place-items-center">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 m-0 cursor-pointer appearance-none rounded-[4px] border-[1.5px] border-[var(--text-muted)]/70 bg-transparent outline-none transition-colors checked:border-[var(--accent-blue)] checked:bg-[var(--accent-blue)] hover:border-[var(--text-secondary)] checked:hover:border-[var(--accent-blue)] focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)]/40"
      />
      <Check
        aria-hidden
        size={11}
        strokeWidth={3.2}
        className="pointer-events-none relative text-[var(--bg-primary)] opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
  );
}
