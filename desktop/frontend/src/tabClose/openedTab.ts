import { AnswerTabRequest } from "../../bridge/commands";
import type { StartedTab } from "../hooks/terminals/types";
import { findAICLI } from "../slashCommands";

/** What came of a task asked to run in a tab. */
export interface OpenedTab {
  /** Unset for a task that opens no tab, or whose tab waits for an answer. */
  tab?: StartedTab;
  /** The command it runs, and whether a prompt goes with it. */
  cmd?: string;
  prompted?: boolean;
  error?: string;
}

/** Whether `cmd` launches an agent that starts a turn by itself: one given a
 *  prompt, or words of its own on the command line. */
export function startsTurn(cmd: string | undefined, prompted = false): boolean {
  const agent = findAICLI(cmd);
  if (!cmd || !agent) return false;
  return prompted || cmd.slice(agent.end).split(/\s+/).some((word) => word !== "" && !word.startsWith("-"));
}

/** Tells `lpm run`, waiting under `request`, which tab its task opened. */
export function reportOpenedTab(request: number, { tab, cmd, prompted, error }: OpenedTab): void {
  void AnswerTabRequest(request, {
    tab: tab?.id ?? null,
    reused: tab?.reused ?? false,
    startsTurn: startsTurn(cmd, prompted),
    ...(error ? { error } : {}),
  }).catch(() => {});
}
