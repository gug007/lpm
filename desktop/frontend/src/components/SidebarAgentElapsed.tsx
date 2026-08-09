import { useSecondsClock } from "../hooks/useSecondsClock";
import { shortDuration } from "../jobsFormat";
import type { SidebarAgentRow } from "../sidebarAgents";

/** How long a task took, or has been taking. Subscribes to the shared clock on
 *  its own so a tick re-renders this label alone — and not at all once the turn
 *  has ended and the reading stops moving. */
export function SidebarAgentElapsed({ agent }: { agent: SidebarAgentRow }) {
  const now = useSecondsClock(agent.until !== undefined || agent.since === null);
  if (agent.since === null) return null;
  return (
    <span className="shrink-0 tabular-nums">
      {shortDuration((agent.until ?? now) - agent.since)}
    </span>
  );
}
