import { X } from "lucide-react";

interface StatsScopeChipProps {
  label: string;
  clearLabel: string;
  onClear: () => void;
}

/** What the page is narrowed to, in the Stats header, with a way back. */
export function StatsScopeChip({ label, clearLabel, onClear }: StatsScopeChipProps) {
  return (
    <span className="flex h-6 max-w-[200px] shrink-0 items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-active)] pl-2.5 pr-1 text-[12px] font-medium text-[var(--text-primary)]">
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onClear}
        aria-label={clearLabel}
        title={clearLabel}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-[120ms] text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
      >
        <X size={11} strokeWidth={2.4} />
      </button>
    </span>
  );
}
