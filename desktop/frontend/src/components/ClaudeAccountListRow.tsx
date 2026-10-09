import type { ReactNode } from "react";
import type { UsageMeter } from "../sidebarUsage";
import { AccountMeters } from "./AccountMeters";
import { InlineNameEditor } from "./InlineNameEditor";

export interface AccountChip {
  text: string;
  tone: "claude" | "red" | "amber" | "muted";
}

const TONES: Record<AccountChip["tone"], string> = {
  claude: "bg-[color-mix(in_srgb,var(--accent-claude)_16%,transparent)] text-[var(--accent-claude-text)]",
  red: "bg-[color-mix(in_srgb,var(--accent-red)_14%,transparent)] text-[var(--accent-red-text)]",
  amber: "bg-[color-mix(in_srgb,var(--accent-amber)_16%,transparent)] text-[var(--accent-amber-text)]",
  muted: "bg-[var(--bg-active)] text-[var(--text-muted)]",
};

interface ClaudeAccountListRowProps {
  label: string;
  signedIn: boolean;
  planLabel?: string;
  // Under the name: the email, or why the account can't take turns yet.
  detail: ReactNode;
  meters: UsageMeter[];
  chips: AccountChip[];
  // Its place in the rotation, beside the drag handle.
  order?: number;
  handle?: ReactNode;
  // Leaves room for the handle and place so names line up with rotation rows.
  indent?: boolean;
  rename?: { onCommit: (label: string) => void; onCancel: () => void };
  actions?: ReactNode;
  menu?: ReactNode;
}

/** One account in Settings → Claude accounts: who it is, where it stands for
 *  new sessions, its usage, and what can be done with it. */
export function ClaudeAccountListRow({
  label,
  signedIn,
  planLabel,
  detail,
  meters,
  chips,
  order,
  handle,
  indent = false,
  rename,
  actions,
  menu,
}: ClaudeAccountListRowProps) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
      {handle}
      {order !== undefined && (
        <span className="w-3.5 shrink-0 text-center text-[11px] tabular-nums text-[var(--text-muted)]">{order}</span>
      )}
      {indent && <span className="w-10 shrink-0" />}
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[12px] font-semibold uppercase text-[var(--text-secondary)]">
        {label.charAt(0)}
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-secondary)] ${
            signedIn ? "bg-[var(--accent-green)]" : "bg-[var(--text-muted)]"
          }`}
          title={signedIn ? "Signed in" : "Not signed in"}
        />
      </span>
      <span className="min-w-0 flex-1">
        {rename ? (
          <span className="flex items-center gap-2">
            <InlineNameEditor
              initial={label}
              commitTitle="Save (Esc to cancel)"
              onCommit={rename.onCommit}
              onCancel={rename.onCancel}
            />
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
            {planLabel && (
              <span className="shrink-0 rounded border border-[var(--border)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                {planLabel}
              </span>
            )}
            {chips.map((chip) => (
              <span key={chip.text} className={`shrink-0 rounded-full px-2 py-px text-[10px] ${TONES[chip.tone]}`}>
                {chip.text}
              </span>
            ))}
          </span>
        )}
        <span className="block text-[11px] leading-snug text-[var(--text-muted)]">{detail}</span>
      </span>
      {meters.length > 0 && (
        <span className="flex w-44 shrink-0 flex-col gap-1">
          <AccountMeters meters={meters} />
        </span>
      )}
      {actions && <span className="flex shrink-0 items-center gap-1.5">{actions}</span>}
      {menu ?? <span className="w-7 shrink-0" />}
    </div>
  );
}
