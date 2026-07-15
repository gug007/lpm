import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string;
  aside?: ReactNode;
  caption?: ReactNode;
  children?: ReactNode;
}

export function StatTile({ label, value, aside, caption, children }: StatTileProps) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3.5">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {aside}
      </div>
      {children}
      {caption && (
        <div className="mt-auto pt-2 text-[11px] tabular-nums text-[var(--text-muted)]">
          {caption}
        </div>
      )}
    </div>
  );
}
