import type { ReactNode } from "react";
import { AgentStatusChip } from "../AgentStatusChip";
import { actionTextColor } from "../../actionColors";
import { formatDuration } from "../../jobsFormat";
import { useSecondsClock } from "../../hooks/useSecondsClock";
import type { PaneAgentStatus } from "../../hooks/usePaneStatus";
import { clockLabel } from "../../sendLater/time";
import { relativeAgo } from "../../relativeTime";
import type { TabFork } from "../../paneTree";
import type { TerminalCommandState } from "../../store/terminalCommands";
import { TAB_CARD_KEY as KEY, TabCardRow } from "./TabCardRow";

// A working tab already shimmers in the strip, so the card leaves that state
// word out and keeps only how long the turn has been running.
function showsState(status: PaneAgentStatus | null | undefined): status is PaneAgentStatus {
  return !!status && status.state !== "working";
}

/** Whether a tab has anything for the card beyond its title. */
export function tabCardHasDetails(
  status: PaneAgentStatus | null | undefined,
  origin: string | undefined,
  fork?: TabFork,
  command?: TerminalCommandState,
  hasAccount = false,
): boolean {
  return (
    !!origin ||
    !!fork ||
    !!command ||
    hasAccount ||
    (!!status && (status.state !== "working" || status.since !== null))
  );
}

/** The hover card for a terminal tab: its full title over labelled rows for the
 *  agent's state, how long it has been in it, the action the tab came from and
 *  the Claude account it runs as. A row without a value is left out. */
export function TabTooltipCard({
  label,
  icon,
  origin,
  color,
  agentStatus,
  fork,
  command,
  account,
}: {
  label: string;
  icon?: ReactNode;
  origin?: string;
  color?: string;
  agentStatus?: PaneAgentStatus | null;
  fork?: TabFork;
  // The shell's command running now, or the last one when it left a mark.
  command?: TerminalCommandState;
  // The row naming the tab's Claude account.
  account?: ReactNode;
}) {
  const since = agentStatus?.since ?? null;
  const until = agentStatus?.until;
  const running = command?.running;
  const last = command?.last;
  const now = useSecondsClock((since === null || until !== undefined) && !running);
  const elapsed = since === null ? "" : formatDuration(Math.max(0, (until ?? now) - since) / 1000);

  return (
    <span className="flex min-w-[200px] flex-col gap-2 leading-snug">
      <span className="line-clamp-5 text-[12.5px] font-semibold">{label}</span>
      <span className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-[11px]">
        {showsState(agentStatus) && (
          <>
            <span className={KEY}>Status</span>
            <AgentStatusChip status={agentStatus} showElapsed={false} />
          </>
        )}
        {since !== null && (
          <>
            <span className={KEY}>{until !== undefined ? "Took" : "For"}</span>
            <span className="flex min-w-0 items-center gap-1.5 font-medium tabular-nums">
              {elapsed}
              <span className={`truncate font-normal ${KEY}`}>
                · {until !== undefined ? "ended" : "since"} {clockLabel(until ?? since)}
              </span>
            </span>
          </>
        )}
        {running && (
          <TabCardRow
            label="Running"
            value={running.command}
            mono
            note={formatDuration(Math.max(0, now - running.since) / 1000)}
          />
        )}
        {last && (
          <TabCardRow
            label="Last"
            value={last.command}
            mono
            note={`${last.code === 0 ? `took ${formatDuration(last.ms / 1000)}` : `exit ${last.code}`} · ${relativeAgo(Math.floor(last.at / 1000))}`}
          />
        )}
        {fork && <TabCardRow label="Fork of" value={fork.label} note={relativeAgo(Math.floor(fork.at / 1000))} />}
        {origin && (
          <>
            <span className={KEY}>Action</span>
            <span
              className="flex min-w-0 items-center gap-1.5 font-medium"
              style={{ color: actionTextColor(color) ?? "var(--text-secondary)" }}
            >
              {icon && <span className="flex shrink-0 items-center [&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
              <span className="truncate">{origin}</span>
            </span>
          </>
        )}
        {account}
      </span>
    </span>
  );
}
