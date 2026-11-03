import { useState } from "react";
import { limitStopDetail, limitStopHeadline, limitStopHolds, limitStopReset } from "../../claudeLimitStop";
import { useLimitStop } from "../../hooks/useLimitStop";
import { useNow } from "../../hooks/useNow";
import { isPeerName, peerSlugOf } from "../../peer/markers";
import { openClaudeAccountSettings } from "../../store/claudeAccountPin";
import { ChevronDownIcon, XIcon } from "../icons";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { TabClaudeAccountList } from "./TabClaudeAccountList";

const BUTTON =
  "flex shrink-0 items-center gap-1 rounded-md border border-[var(--border)] px-2 py-0.5 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]";

interface LimitStopBarProps {
  projectName: string;
  terminalId: string;
  // Moves the tab to another account; absent where that isn't possible.
  onContinue?: (account: string, label: string) => void;
}

// A Claude tab that stopped at its account's limit: which account ran out,
// when it resets, and the account lpm would carry the conversation on. The
// move happens only on a click; a hold or a single model's limit offers none.
export function LimitStopBar({ projectName, terminalId, onContinue }: LimitStopBarProps) {
  const { stop, dismiss } = useLimitStop(projectName, terminalId);
  const now = useNow(!!stop, 60000);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  if (!stop || !limitStopHolds(stop, now)) return null;

  const reset = limitStopReset(stop, now);
  const offer = stop.offer;
  const tone = stop.kind === "model" ? "var(--accent-amber)" : "var(--accent-red)";
  const machine = isPeerName(terminalId) ? peerSlugOf(projectName) : null;

  return (
    <div
      role="status"
      data-testid="limit-stop-bar"
      className="terminal-surface relative flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t px-3 py-1.5 text-[12px]"
      style={{
        borderTopColor: `color-mix(in srgb, ${tone} 40%, var(--border))`,
        background: `color-mix(in srgb, ${tone} 6%, var(--terminal-bg))`,
      }}
    >
      <span className="flex min-w-0 flex-1 basis-64 items-baseline gap-2">
        <span className="h-1.5 w-1.5 shrink-0 -translate-y-px rounded-full" style={{ background: tone }} />
        <span className="min-w-0">
          <span className="font-semibold text-[var(--text-primary)]">{limitStopHeadline(stop)}</span>
          {reset && <span className="text-[var(--text-secondary)]"> · {reset}</span>}
          <span className="block text-[var(--text-muted)]">{limitStopDetail(stop, now)}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {offer && onContinue && (
          <>
            <button
              type="button"
              onClick={() => onContinue(offer.account, offer.label)}
              className="shrink-0 rounded-md bg-[var(--text-primary)] px-2 py-0.5 font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
            >
              Continue on {offer.label}
            </button>
            <button
              type="button"
              aria-expanded={!!menuAnchor}
              onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}
              className={BUTTON}
            >
              Other account
              <ChevronDownIcon />
            </button>
          </>
        )}
        {stop.kind === "hold" && (
          <button type="button" onClick={() => openClaudeAccountSettings(machine)} className={BUTTON}>
            Open settings
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="flex shrink-0 items-center rounded-md px-1 py-0.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </span>
      {menuAnchor && onContinue && (
        <ContextMenuShell
          anchor={menuAnchor}
          side="top"
          align="end"
          onClose={() => setMenuAnchor(null)}
        >
          <TabClaudeAccountList
            projectName={projectName}
            terminalId={terminalId}
            working={false}
            onPick={onContinue}
            onClose={() => setMenuAnchor(null)}
          />
        </ContextMenuShell>
      )}
    </div>
  );
}
