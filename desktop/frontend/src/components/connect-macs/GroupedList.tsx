import { type ReactNode } from "react";

// The Mobile-devices settings grammar: a small uppercase section label, a
// bordered rounded card whose rows are split by full-width dividers, and
// px-4 py-3 rows with right-aligned controls.

export function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

export function Group({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)]">
      <div className="divide-y divide-[var(--border)]">{children}</div>
    </div>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex items-center gap-3 px-4 py-3 ${className}`}>{children}</div>;
}
