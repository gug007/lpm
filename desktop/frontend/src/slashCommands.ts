import { AI_CLI_OPTIONS, type AICLI } from "./types";

// One slash command surfaced by the composer's autocomplete, mirroring the Rust
// AgentCommand returned by ListAgentCommands.
export interface SlashCommand {
  name: string; // no leading "/", e.g. "review" or "prompts:draftpr"
  description: string;
  argumentHint: string;
  source: "builtin" | "project" | "user";
}

// A "/<frag>" run ending at the caret opens the command menu. The "/" may sit
// anywhere in the prompt — start of a line, after a space, or after an attachment
// chip (the "￼" stand-in lineBeforeCaret emits) — so a command can be completed
// mid-prompt, matching how "@" mentions trigger. Requiring that boundary keeps a
// path ("src/app") or a URL ("https://x") from opening the menu. ":" is allowed in
// the fragment for namespaced names like "prompts:draftpr".
export const SLASH_TRIGGER = /(?:^|[\s￼])\/([a-z0-9:_-]*)$/i;

// A completed command followed by exactly one space at the caret — shows the
// command's argument-hint as ghost text, the way the CLIs do. A second space or
// any typed argument ends this state and hides the hint.
export const HINT_TRIGGER = /(?:^|[\s￼])\/([a-z0-9:_-]+) $/i;

const AI_CLIS = AI_CLI_OPTIONS.map((o) => o.value);

// Identify which AI CLI a terminal runs from its launch command, by matching the
// basename of any token (split on whitespace and shell operators) against a known
// CLI name. Returns null for plain shells / unrecognized commands, which keeps
// the slash menu closed for terminals that aren't running an agent.
export function detectAICLI(cmd: string | undefined | null): AICLI | null {
  if (!cmd) return null;
  for (const token of cmd.split(/[\s;&|]+/)) {
    if (!token) continue;
    const base = token.split("/").pop() ?? token;
    const hit = AI_CLIS.find((c) => c === base);
    if (hit) return hit;
  }
  return null;
}
