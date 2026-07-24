import { shellQuote } from "../../terminal-io";
import { detectAICLI } from "../../slashCommands";
import { type PaneLeaf, type TerminalInstance } from "../../paneTree";

// Client-side id for panes + browser webview labels (terminal ids come from the backend).
export function nextId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function appendTerminal(pane: PaneLeaf, term: TerminalInstance): PaneLeaf {
  return {
    ...pane,
    tabs: [...pane.tabs, term],
    activeTabIdx: pane.tabs.length,
    activeServiceName: undefined,
  };
}

// Seed a launched agent with its initial task the same way the generator flow
// does: fold a text prompt into the launch command as a positional argument
// (e.g. `claude '<task>'`) so the CLI submits it once it's ready. Typing it into
// the TUI after launch is unreliable — agents boot through async phases (MCP
// load, auth checks) whose pauses fool idle detection into firing mid-boot, so
// the submit is swallowed and the prompt sits unsent. Only plain-text prompts
// fold; an image prompt stays an array so it can be delivered as an isolated
// bracketed paste (the only reliable way to attach a file), and a non-agent
// command is left untouched.
export function foldAgentPrompt(
  cmd: string,
  prompt?: string | string[],
): { cmd: string; prompt?: string | string[] } {
  if (typeof prompt === "string" && prompt.trim() && detectAICLI(cmd)) {
    return { cmd: `${cmd} ${shellQuote(prompt.trim())}`, prompt: undefined };
  }
  return { cmd, prompt };
}

export function resolveActiveAfterClose(prevActive: number, removed: number, remaining: number): number {
  if (remaining === 0) return 0;
  if (prevActive === removed) return Math.min(removed, remaining - 1);
  if (prevActive > removed) return prevActive - 1;
  return prevActive;
}
