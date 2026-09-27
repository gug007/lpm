import type { ReactNode } from "react";
import { AgentStatusChip } from "../AgentStatusChip";
import { actionTextColor } from "../../actionColors";
import { formatDuration } from "../../jobsFormat";
import { useSecondsClock } from "../../hooks/useSecondsClock";
import type { PaneAgentStatus } from "../../hooks/usePaneStatus";
import { clockLabel } from "../../sendLater/time";

const KEY = "text-[var(--text-muted)]";

// A working tab already shimmers in the strip, so the card leaves that state
// word out and keeps only how long the turn has been running.
function showsState(status: PaneAgentStatus | null | undefined): status is PaneAgentStatus {
  return !!status && status.state !== "working";
}

/** Whether a tab has anything for the card beyond its title. */
export function tabCardHasDetails(
  status: PaneAgentStatus | null | undefined,
  origin: string | undefined,
): boolean {
  return !!origin || (!!status && (status.state !== "working" || status.since !== null));
}

/** The hover card for a terminal tab: its full title over labelled rows for the
 *  agent's state, how long it has been in it, and the action the tab came from.
 *  A row without a value is left out. */
export function TabTooltipCard({
  label,
  icon,
  origin,
  color,
  agentStatus,
}: {
  label: string;
  icon?: ReactNode;
  origin?: string;
  color?: string;
  agentStatus?: PaneAgentStatus | null;
}) {
  const since = agentStatus?.since ?? null;
  const until = agentStatus?.until;
  const now = useSecondsClock(since === null || until !== undefined);
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
      </span>
    </span>
  );
}
