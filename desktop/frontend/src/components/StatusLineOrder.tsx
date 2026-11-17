import type { ReactNode } from "react";

// The builder's "Status line order · N items" row, its actions, and the drop
// zone the item chips sit and reorder in.
export function StatusLineOrder({
  count,
  actions,
  children,
}: {
  count: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">
          Status line order
        </span>
        <span className="text-[12px] tabular-nums text-[var(--text-muted)]">
          · {count} {count === 1 ? "item" : "items"}
        </span>
        {actions && <span className="ml-auto flex min-w-0 items-center gap-1.5">{actions}</span>}
      </div>
      <div className="flex min-h-12 flex-wrap content-start items-start gap-1.5 rounded-lg bg-[var(--bg-primary)]/60 p-2">
        {children}
      </div>
    </div>
  );
}
