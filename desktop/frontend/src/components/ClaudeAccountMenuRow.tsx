import { providerMeta } from "../agentStatus";
import type { UsageMeter } from "../sidebarUsage";
import { CheckIcon } from "./icons";
import { AccountMeters } from "./AccountMeters";

interface ClaudeAccountMenuRowProps {
  label: string;
  signedIn: boolean;
  meters: UsageMeter[];
  current: boolean;
  onClick: () => void;
}

/** One account in the Claude account menu: its name, then a bar per usage
 *  window drawn the way the sidebar draws it, so the account with room left
 *  can be picked at a glance. */
export function ClaudeAccountMenuRow({ label, signedIn, meters, current, onClick }: ClaudeAccountMenuRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col gap-1 px-3 py-1.5 text-left text-[11px] text-[var(--text-secondary)] outline-none transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:bg-[var(--bg-hover)] focus-visible:text-[var(--text-primary)]"
    >
      <span className="flex w-full items-center gap-2">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: signedIn ? providerMeta("claude").color : "var(--text-muted)" }}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {!signedIn ? (
          <span className="shrink-0 text-[10px] text-[var(--text-muted)]">Not signed in</span>
        ) : (
          meters.length === 0 && <span className="shrink-0 text-[10px] text-[var(--text-muted)]">—</span>
        )}
        <span className="flex w-3 shrink-0 justify-end text-[var(--text-muted)]">{current && <CheckIcon />}</span>
      </span>
      {signedIn && <AccountMeters meters={meters} className="pl-3.5" />}
    </button>
  );
}
