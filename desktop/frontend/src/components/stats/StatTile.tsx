import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string;
  aside?: ReactNode;
  children?: ReactNode;
}

export function StatTile({ label, value, aside, children }: StatTileProps) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3.5 transition-colors duration-[120ms] hover:border-[var(--text-muted)]/30 hover:bg-[var(--bg-hover)]">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {aside}
      </div>
      {children}
    </div>
  );
}
