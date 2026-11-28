import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import type { TalkRow } from "../../talk/plan";

export type TalkRowStatus = "idle" | "running" | "done";

interface TalkPlanRowProps {
  row: TalkRow;
  icon: ReactNode;
  status: TalkRowStatus;
  // The last row has no line running down to a next one.
  last: boolean;
  // Shown in place of the value: the prompt while it is being edited.
  editor?: ReactNode;
  // The row's "Change" or "Edit", hidden once the plan runs.
  action?: ReactNode;
}

// One line of the plan: what happens, to what, and a way to change it.
export function TalkPlanRow({ row, icon, status, last, editor, action }: TalkPlanRowProps) {
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
      <div className={`flex min-w-0 flex-1 gap-3 ${editor ? "items-start" : "items-center"} ${last ? "" : "pb-3"}`}>
        <span className="w-[72px] shrink-0 text-xs leading-7 text-[var(--text-muted)]">{row.label}</span>
        {editor ?? (
          <span
            title={row.value}
            className={`min-w-0 flex-1 truncate text-[13px] font-medium leading-7 ${
              row.missing ? "text-[var(--accent-amber-text)]" : "text-[var(--text-primary)]"
            }`}
          >
            {row.value}
          </span>
        )}
        {action && <span className="flex h-7 shrink-0 items-center">{action}</span>}
      </div>
    </li>
  );
}
