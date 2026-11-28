import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";

export type TalkRowStatus = "idle" | "running" | "done";

interface TalkPlanRowProps {
  icon: ReactNode;
  status: TalkRowStatus;
  // The last row has no line running down to a next one.
  last: boolean;
  // What the step does, and the thing it does it to: each a menu or a field
  // until the plan runs.
  title: ReactNode;
  children: ReactNode;
}

// One line of the plan: what happens, and to what.
export function TalkPlanRow({ icon, status, last, title, children }: TalkPlanRowProps) {
  const tile =
    status === "done" ? (
      <Check size={14} className="text-[var(--accent-green)]" />
    ) : status === "running" ? (
      <Loader2 size={14} className="animate-spin text-[var(--accent-blue)]" />
    ) : (
      icon
    );
  return (
    <li className="flex items-stretch gap-3">
      <div aria-hidden className="flex shrink-0 flex-col items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)]">
          {tile}
        </span>
        {!last && <span className="min-h-3 w-px flex-1 bg-[var(--border)]" />}
      </div>
      <div className={`flex min-w-0 flex-1 items-start gap-3 ${last ? "" : "pb-3"}`}>
        <span className="flex h-7 w-[72px] shrink-0 items-center text-xs text-[var(--text-muted)]">{title}</span>
        <div className="flex min-h-7 min-w-0 flex-1 items-center">{children}</div>
      </div>
    </li>
  );
}
