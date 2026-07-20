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
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/60 px-3 text-left outline-none transition-colors hover:bg-[var(--bg-hover)] focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-40"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-medium text-[var(--text-primary)]">
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
          {description}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative h-[20px] w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--accent-green)]" : "bg-[var(--bg-active)]"
        }`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}
