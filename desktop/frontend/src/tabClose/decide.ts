import { detectAICLI } from "../slashCommands";
import { commandName } from "../tabCommand";
import type { CloseRefusal, CloseTabRequest, NamedTab, TabFacts } from "./request";

/** A terminal tab a close may be asked of. */
export interface ClosableTab {
  id: string;
  /** What the strip calls it, then what it is called when no command names it. */
  names: string[];
  pinned: boolean;
  facts: TabFacts;
  /** The command its shell says it runs. */
  command: string | null;
  /** Its shell has reported a command, running or ended. */
  ranCommand: boolean;
  /** Something written for it that closing would lose or unschedule. */
  holds: "unsent" | "scheduled" | null;
}

export type CloseVerdict =
  | { do: "close" | "wait" | "waitForFirstTurn" }
  | { refuse: CloseRefusal; detail?: string };

export const namedTab = (tab: ClosableTab): NamedTab => ({ tab: tab.id, name: tab.names[0] });

/** The tabs `wanted` stands for: the one with that id, else those with that
 *  name, exactly before ignoring case. */
export function matchingTabs(tabs: ClosableTab[], wanted: string): ClosableTab[] {
  const byId = tabs.filter((t) => t.id === wanted);
  if (byId.length > 0) return byId;
  const exact = tabs.filter((t) => t.names.includes(wanted));
  if (exact.length > 0) return exact;
  const lower = wanted.toLowerCase();
  return tabs.filter((t) => t.names.some((name) => name.toLowerCase() === lower));
}

// A shell that doesn't report its commands names none, and an agent started
// through an alias doesn't read as one, so whether a command runs is the
// backend's to say. Flags, where tokens tend to go, are left out of its name.
function runningCommand({ command, ranCommand, facts }: ClosableTab): string | null {
  const named = command !== null && detectAICLI(command) === null;
  const running = facts.busy === undefined || (facts.busy && facts.reported) ? named : facts.busy;
  return running || (facts.launching && !ranCommand) ? commandName(command ?? "") : null;
}

/** What closing `tab` for a command comes to. Nothing is lost unless it was
 *  forced, a pinned tab has no × to stand for, and a command never ends the
 *  agent it was run by mid-turn. */
export function decideClose(tab: ClosableTab, request: CloseTabRequest): CloseVerdict {
  const { agent, starting } = tab.facts;
  const own = tab.id === request.own;
  const command = runningCommand(tab);
  if (tab.pinned) return { refuse: "pinned" };
  if (request.whenDone) {
    if (tab.holds) return { refuse: tab.holds };
    if (agent) return { do: "wait" };
    if (starting) return { do: "waitForFirstTurn" };
    if (own) return { refuse: "ownIdle" };
    if (command !== null) return { refuse: "command", detail: command };
    return { do: "close" };
  }
  if (own) return { refuse: "own" };
  if (request.force) return { do: "close" };
  if (agent) return { refuse: agent };
  if (starting) return { refuse: "starting" };
  if (command !== null) return { refuse: "command", detail: command };
  if (tab.holds) return { refuse: tab.holds };
  return { do: "close" };
}
