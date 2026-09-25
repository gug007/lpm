import type { ReactNode } from "react";

export default function StatsTile({
  label,
  value,
  extra,
  caption,
  children,
}: {
  label: string;
  value: string;
  extra?: ReactNode;
  caption: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-3 sm:px-4 sm:py-3.5">
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-2">
        <p className="text-xl font-semibold tracking-tight tabular-nums text-[var(--text-primary)] sm:text-2xl">
          {value}
        </p>
        {extra}
      </div>
      {children}
      <p className="mt-auto pt-2 text-[11px] tabular-nums text-[var(--text-muted)]">{caption}</p>
    </div>
  );
}
