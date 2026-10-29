interface LogFilterChipProps {
  label: string;
  count?: number;
  on: boolean;
  onClick: () => void;
}

export function LogFilterChip({ label, count, on, onClick }: LogFilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] transition-colors ${
        on
          ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
          : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
      {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  );
}
