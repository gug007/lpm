import { count } from "./count";
import { keepAwakeStopped, shortLeft, type KeepAwakeState } from "./keepAwake";

/** How near its end a countdown turns the cup amber: when keepawake_headsup.rs
 *  sends its "can sleep in 5 min" toast. */
export const ENDING_MS = 5 * 60_000;

export interface KeepAwakeCupLook {
  /** Held: the text color, with coffee. Ending: amber, its end 5 min or less
   *  away. Ready: a gray outline, waiting for an agent. Stopped: a gray outline,
   *  on but not held. */
  tone: "held" | "ending" | "ready" | "stopped";
  /** How full the coffee is while it holds, draining with a countdown; null
   *  for an empty cup. */
  level: number | null;
  /** Beside the cup: how many agents hold it, the time left, or the battery
   *  floor it stopped at. */
  text: string | null;
  /** On the cup's corner: paused by power, or couldn't hold. */
  mark: "battery" | "error" | null;
  /** Connected computers kept awake, counted beside the cup. */
  others: number;
}

/** How the footer's cup looks for this machine's state, with `total` the
 *  length of the running countdown and `othersOn` the connected computers kept
 *  awake; null when there's nothing to show. */
export function keepAwakeCup(
  state: KeepAwakeState | null,
  left: number | null,
  total: number | null,
  othersOn: number,
): KeepAwakeCupLook | null {
  const empty = (
    tone: KeepAwakeCupLook["tone"],
    mark: KeepAwakeCupLook["mark"] = null,
    text: string | null = null,
  ): KeepAwakeCupLook => ({ tone, level: null, text, mark, others: othersOn });

  if (!state || state.mode === "off") return othersOn > 0 ? empty("ready") : null;
  if (keepAwakeStopped(state)) {
    if (state.power === "failed") return empty("stopped", "error");
    return empty("stopped", "battery", state.power === "low" ? `${state.floor}%` : null);
  }
  if (!state.active) return empty("ready");

  const working = state.mode === "agents" && state.agents > 0;
  const counting = working || left === null ? null : left;
  return {
    tone: counting !== null && counting <= ENDING_MS ? "ending" : "held",
    level: counting !== null && total ? Math.min(1, counting / total) : 1,
    text: working ? count(state.agents, "agent", "agents") : counting !== null ? shortLeft(counting) : null,
    mark: null,
    others: othersOn,
  };
}
