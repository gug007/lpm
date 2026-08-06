import type { ReactNode } from "react";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1 py-px font-mono text-[10px] text-[var(--text-secondary)]">
      {children}
    </kbd>
  );
}
