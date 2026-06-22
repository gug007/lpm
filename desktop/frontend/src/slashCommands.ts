import { AI_CLI_OPTIONS, type AICLI } from "./types";

// One slash command surfaced by the composer's autocomplete, mirroring the Rust
// AgentCommand returned by ListAgentCommands.
export interface SlashCommand {
  name: string; // no leading "/", e.g. "review" or "prompts:draftpr"
  description: string;
  argumentHint: string;
  source: "builtin" | "project" | "user";
}

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
