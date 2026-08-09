import type { AgentState } from "../agentStatus";
import { AGENT_STATE_TONE } from "../agentStatus";
import { AlertCircleIcon, BellIcon } from "./icons";

/** One mark's worth of space in an agent row, held whether or not a mark sits
 *  in it, so the names and the times each stay in one column. */
export const MARK_SLOT = "h-3.5 w-3.5 shrink-0";

/** The gutter an agent row leads with. Only a state that wants the user fills
 *  it: an amber bell, or a red mark for a problem. Work in progress and
 *  finished work say so through the name itself — a shimmer, then blue. */
export function AgentStateIcon({ state }: { state: AgentState }) {
  if (state !== "needs-you" && state !== "error") return <span className={MARK_SLOT} />;
  return (
    <span className={`${MARK_SLOT} ${AGENT_STATE_TONE[state]}`}>
      {state === "needs-you" ? <BellIcon /> : <AlertCircleIcon />}
    </span>
  );
}
