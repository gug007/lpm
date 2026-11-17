import type { ReactNode } from "react";

// A control with its name above it, for rows that hold several side by side.
export function LabeledControl({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] text-[var(--text-muted)]">{label}</span>
      {children}
    </div>
  );
}
