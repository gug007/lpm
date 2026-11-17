import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";

interface StatTileProps {
  label: string;
  value: string;
  // Beside the label: the change against the period before.
  change?: ReactNode;
  aside?: ReactNode;
  // One bar per day; absent when there is only one.
  series?: number[];
  caption?: ReactNode;
}

export function StatTile({ label, value, change, aside, series, caption }: StatTileProps) {
  return (
    <div className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-[var(--text-muted)]">{label}</span>
        {change && <span className="text-[11px]">{change}</span>}
      </div>
      <div className="mt-1 flex min-h-8 items-center justify-between gap-2">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        {aside}
      </div>
      {series && series.length > 1 && (
        <div className="mt-2">
          <Sparkline data={series} height={20} />
        </div>
      )}
      {caption && (
        <div className="mt-auto truncate pt-2 text-[11px] tabular-nums text-[var(--text-muted)]">
          {caption}
        </div>
      )}
    </div>
  );
}
