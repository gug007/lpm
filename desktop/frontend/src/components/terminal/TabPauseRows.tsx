import type { AgentPause } from "../../agentPause";
import { TAB_CARD_KEY as KEY } from "./TabCardRow";

/** The rows of a paused tab's hover card: each background shell the turn waits
 *  on, in the agent's words, then what happens when one ends. */
export function TabPauseRows({ pause }: { pause: AgentPause }) {
  return (
    <>
      {pause.shells.map((shell, i) => (
        <span key={i} className="contents">
          <span className={KEY}>{i === 0 ? "Waits on" : ""}</span>
          <span className="min-w-0 font-medium line-clamp-2">{shell}</span>
        </span>
      ))}
      <span />
      <span className={KEY}>Carries on by itself when {pause.shells.length === 1 ? "it" : "one"} ends</span>
    </>
  );
}
