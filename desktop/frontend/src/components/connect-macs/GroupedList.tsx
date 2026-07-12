import { Children, type ReactNode } from "react";

// The macOS System Settings / iOS "grouped inset list" building blocks: a small
// uppercase header, an inset rounded card whose rows are split by left-inset
// hairlines, and a muted footer for explanatory prose. Rows sit at a consistent
// height with px-4; controls right-align.

export function GroupHeader({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
      {children}
    </h2>
  );
}

export function GroupFooter({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{children}</p>;
}

// Renders each child as a row, inserting a left-inset hairline between them.
// Falsy children (from `cond && <Row/>`) are dropped, so conditional rows never
// leave a stray divider.
export function Group({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      {rows.map((row, i) => (
        <div key={i}>
          {i > 0 && <div className="ml-4 h-px bg-[var(--border)]" />}
          {row}
        </div>
      ))}
    </div>
  );
}

export function Row({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-[44px] items-center gap-3 px-4 ${className}`}>{children}</div>;
}
