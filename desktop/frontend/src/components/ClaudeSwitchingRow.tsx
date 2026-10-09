import type { ReactNode } from "react";
import type { UsageMeter } from "../sidebarUsage";
import type { PoolAccount } from "../store/claudePool";
import { AccountMeters } from "./AccountMeters";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";

export interface SwitchingChip {
  text: string;
  tone: "claude" | "red" | "amber" | "muted";
}

const TONES: Record<SwitchingChip["tone"], string> = {
  claude: "bg-[color-mix(in_srgb,var(--accent-claude)_16%,transparent)] text-[var(--accent-claude-text)]",
  red: "bg-[color-mix(in_srgb,var(--accent-red)_14%,transparent)] text-[var(--accent-red-text)]",
  amber: "bg-[color-mix(in_srgb,var(--accent-amber)_16%,transparent)] text-[var(--accent-amber-text)]",
  muted: "bg-[var(--bg-active)] text-[var(--text-muted)]",
};

interface ClaudeSwitchingRowProps {
  label: string;
  account?: PoolAccount;
  meters: UsageMeter[];
  chips: SwitchingChip[];
  // Shown instead of the email, e.g. why an account can't take turns yet.
  note?: string;
  // Reorder arrows for an account in the list.
  move?: { up?: () => void; down?: () => void };
  action?: ReactNode;
}

const ARROW =
  "flex h-4 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30";

/** One account in Settings → Account switching: who it is, where it stands
 *  for new sessions, and its usage underneath. */
export function ClaudeSwitchingRow({ label, account, meters, chips, note, move, action }: ClaudeSwitchingRowProps) {
  const signedIn = account?.signedIn ?? false;
  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm">
      {move && (
        <span className="mt-0.5 flex shrink-0 flex-col">
          <button type="button" className={ARROW} onClick={move.up} disabled={!move.up} aria-label={`Move ${label} up`}>
            <ChevronUpIcon />
          </button>
          <button
            type="button"
            className={ARROW}
            onClick={move.down}
            disabled={!move.down}
            aria-label={`Move ${label} down`}
          >
            <ChevronDownIcon />
          </button>
        </span>
      )}
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[12px] font-semibold uppercase text-[var(--text-secondary)]">
        {label.charAt(0)}
        <span
          className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--bg-secondary)] ${
            signedIn ? "bg-[var(--accent-green)]" : "bg-[var(--text-muted)]"
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="truncate text-[13px] font-medium text-[var(--text-primary)]">{label}</span>
          {account?.planLabel && (
            <span className="shrink-0 rounded border border-[var(--border)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {account.planLabel}
            </span>
          )}
          {chips.map((chip) => (
            <span key={chip.text} className={`shrink-0 rounded-full px-2 py-px text-[10px] ${TONES[chip.tone]}`}>
              {chip.text}
            </span>
          ))}
        </span>
        <span className="block text-[11px] leading-snug text-[var(--text-muted)]">
          {note ?? (signedIn ? account?.email || "Signed in" : "Not signed in")}
        </span>
        {meters.length > 0 && (
          <span className="mt-1.5 flex max-w-xs flex-col gap-0.5">
            <AccountMeters meters={meters} />
          </span>
        )}
      </span>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  );
}
