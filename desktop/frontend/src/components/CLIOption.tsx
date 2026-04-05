interface CLIOptionProps {
  label: string;
  selected: boolean;
  available: boolean | null;
  onSelect: () => void;
}

export function CLIOption({ label, selected, available, onSelect }: CLIOptionProps) {
  const disabled = available === false;
  const base =
    "rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none";
  const state = disabled
    ? "cursor-not-allowed border-[var(--border)] bg-[var(--bg-secondary)] opacity-50"
    : selected
      ? "border-[var(--text-primary)] bg-[var(--bg-hover)]"
      : "border-[var(--border)] hover:bg-[var(--bg-hover)]";

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`${base} ${state}`}
    >
      <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
      <div className="text-[10px] text-[var(--text-muted)]">
        {available === null
          ? "checking\u2026"
          : available
            ? "installed"
            : "not installed"}
      </div>
    </button>
  );
}
