import type { AgentState } from "../agentStatus";
import { AGENT_STATE_TONE } from "../agentStatus";
import { AlertCircleIcon, BellIcon, CheckIcon } from "./icons";

/** One mark's worth of space in an agent row, held whether or not a mark sits
 *  in it, so the names and the times each stay in one column. */
export const MARK_SLOT = "h-3.5 w-3.5 shrink-0";

/** The mark an agent row ends with, beside its clock: a pulsing amber bell
 *  while the agent waits on the user, a red mark for a problem, a blue check
 *  once the turn lands. Work in progress and idle say so through the name
 *  alone. */
export function AgentStateIcon({ state }: { state: AgentState }) {
  const mark =
    state === "needs-you" ? (
      <BellIcon />
    ) : state === "error" ? (
      <AlertCircleIcon />
    ) : state === "done" ? (
      <CheckIcon />
    ) : null;
  if (!mark) return <span className={MARK_SLOT} />;
  return <span className={`${MARK_SLOT} ${AGENT_STATE_TONE[state]}`}>{mark}</span>;
}
