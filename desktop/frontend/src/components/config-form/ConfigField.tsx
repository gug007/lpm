import type { ReactNode } from "react";

export function ConfigField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] text-[var(--text-secondary)]">{label}</span>
      {children}
    </label>
  );
}
