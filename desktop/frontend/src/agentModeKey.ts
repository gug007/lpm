import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { isImeComposing } from "./imeComposing";
import { matchesChord } from "./keys";
import { toast } from "./notifications/toast";
import { useTerminalCommands } from "./store/terminalCommands";
import { sendTerminalInput } from "./terminal-io";

const BACK_TAB = "\x1b[Z";

interface AgentModeKeyTarget {
  terminalId: string;
  // null for a shell with no agent in it, undefined where the host doesn't say.
  agent?: string | null;
  guest: boolean;
  // Whether the agent waits on a choice.
  asks: () => boolean;
}

// Hands the message input's Shift+Tab, the key agent CLIs switch their mode with
// (plan, accept edits…), to the agent the input writes to. While the agent asks
// something the same key is an answer ("Yes, and switch to accept edits"), so it
// isn't passed on then. Returns whether the key was handled.
export function takeAgentModeKey(
  e: KeyboardEvent | ReactKeyboardEvent,
  { terminalId, agent, guest, asks }: AgentModeKeyTarget,
): boolean {
  if (!matchesChord(e, { key: "Tab", shift: true }) || isImeComposing(e)) return false;
  const atPrompt = useTerminalCommands.getState().atPrompt[terminalId];
  const agentListens = guest || (agent ? !atPrompt : agent === undefined && atPrompt === false);
  if (!agentListens) return false;
  e.preventDefault();
  e.stopPropagation();
  if (asks()) toast(`Answer ${agent ?? "the agent"} first, then switch its mode`);
  else sendTerminalInput(terminalId, BACK_TAB).catch(() => {});
  return true;
}
