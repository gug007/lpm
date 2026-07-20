import type { ReactNode } from "react";

interface UsageEmptyPanelProps {
  dot: string;
  dim?: boolean;
  name: string;
  children: ReactNode;
}

export function UsageEmptyPanel({ dot, dim, name, children }: UsageEmptyPanelProps) {
  return (
    <section className="rounded-xl border border-dashed border-[var(--border)] p-4">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: dot, opacity: dim ? 0.35 : 0.6 }}
        />
        <span className="text-sm font-medium tracking-tight text-[var(--text-secondary)]">
          {name}
        </span>
      </div>
      <div className="pt-2">{children}</div>
    </section>
  );
}
