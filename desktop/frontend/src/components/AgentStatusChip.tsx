import { AGENT_STATE_LABEL, AGENT_STATE_TONE } from "../agentStatus";
import { formatDuration } from "../jobsFormat";
import { useSecondsClock } from "../hooks/useSecondsClock";
import type { PaneAgentStatus } from "../hooks/usePaneStatus";

// The dot carries the same animation as the text (AGENT_STATE_TONE) but cannot
// share the class: the text span paints its gradient through
// `-webkit-text-fill-color: transparent`, which a nested dot would inherit, so
// the dot sits outside it and fills from `currentColor` instead.
const DOT: Record<PaneAgentStatus["state"], string> = {
  working: "sidebar-shimmer-icon bg-current",
  "needs-you": "sidebar-waiting bg-current",
  error: "bg-[var(--accent-red)]",
  done: "bg-[var(--accent-blue)]",
};

/** "● Working  2m 30s" — what the agent in a terminal is doing, and how long it
 *  has been doing it. Ticks off the shared seconds clock, so only this label
 *  re-renders. */
export function AgentStatusChip({
  status,
  className = "",
  mutedClassName = "text-[var(--composer-fg-muted)]",
}: {
  status: PaneAgentStatus;
  className?: string;
  mutedClassName?: string;
}) {
  const frozen = status.until !== undefined;
  const now = useSecondsClock(frozen);
  const dot = DOT[status.state];
  const label = AGENT_STATE_LABEL[status.state];
  const elapsed =
    status.since === null
      ? null
      : formatDuration(Math.max(0, (status.until ?? now) - status.since) / 1000);

  return (
    <span
      className={`flex min-w-0 items-center gap-1.5 text-[11px] font-medium ${className}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className={`truncate ${AGENT_STATE_TONE[status.state]}`}>{label}</span>
      {elapsed !== null && (
        <span className={`shrink-0 tabular-nums ${mutedClassName}`}>
          {frozen ? `took ${elapsed}` : elapsed}
        </span>
      )}
    </span>
  );
}
