import { useId } from "react";

export function StatusLineToggle({
  checked,
  disabled,
  label,
  description,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  description: string;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={descriptionId}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-8 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/60 px-2.5 text-left outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-40"
    >
      <span className="whitespace-nowrap text-[10.5px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      <span id={descriptionId} className="sr-only">
        {description}
      </span>
      <span
        aria-hidden
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--accent-green)]" : "bg-[var(--bg-active)]"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-3" : ""
          }`}
        />
      </span>
    </button>
  );
}
