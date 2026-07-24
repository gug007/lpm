import type { ReactNode } from "react";

// One numbered section of the action form. Steps that haven't unlocked yet stay
// visible as a dimmed title + teaser, so the whole flow reads as a roadmap
// before the user has typed anything.
// Earlier steps stack above later ones so a step's open dropdown paints over
// the steps below it; the reveal animation traps absolutely-positioned menus
// in each step's own stacking context, so DOM order alone can't do it.
const STEP_Z = ["z-30", "z-20", "z-10"];

export function WizardStep({
  number,
  title,
  teaser,
  revealed,
  last = false,
  children,
}: {
  number: number;
  title: string;
  teaser?: string;
  revealed: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className={`relative flex gap-3.5 ${STEP_Z[number - 1] ?? "z-0"}`}
    >
      <div className="flex flex-col items-center">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-1 ring-inset transition-colors ${
            revealed
              ? "bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)] ring-[var(--accent-cyan)]/25"
              : "bg-[var(--bg-secondary)] text-[var(--text-muted)] ring-[var(--border)]"
          }`}
        >
          {number}
        </span>
        {!last && <span className="mt-2 w-px flex-1 bg-[var(--border)]" />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-7"}`}>
        <div className="flex min-h-6 items-center">
          <h3
            className={`text-[13px] font-semibold tracking-tight ${
              revealed
                ? "text-[var(--text-primary)]"
                : "text-[var(--text-muted)]"
            }`}
          >
            {title}
          </h3>
        </div>
        {revealed ? (
          <div className="field-reveal mt-4 space-y-6">{children}</div>
        ) : teaser ? (
          <p className="mt-0.5 text-[12px] text-[var(--text-muted)] opacity-80">
            {teaser}
          </p>
        ) : null}
      </div>
    </section>
  );
}
