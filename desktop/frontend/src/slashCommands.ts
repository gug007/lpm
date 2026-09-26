import { AI_CLI_OPTIONS, type AICLI } from "./types";

// One slash command surfaced by the composer's autocomplete, mirroring the Rust
// AgentCommand returned by ListAgentCommands.
export interface SlashCommand {
  name: string; // no leading "/", e.g. "review" or "plugin:command"
  description: string;
  argumentHint: string;
  source: "builtin" | "project" | "user";
}

// A "/<frag>" run ending at the caret opens the command menu. The "/" may sit
// anywhere in the prompt — start of a line, after a space, or after an attachment
// chip (the "￼" stand-in lineBeforeCaret emits) — so a command can be completed
// mid-prompt, matching how "@" mentions trigger. Requiring that boundary keeps a
// path ("src/app") or a URL ("https://x") from opening the menu. ":" is allowed in
// the fragment for namespaced names like "plugin:command".
export const SLASH_TRIGGER = /(?:^|[\s￼])\/([a-z0-9:_-]*)$/i;

// A completed command followed by exactly one space at the caret — shows the
// command's argument-hint as ghost text, the way the CLIs do. A second space or
// any typed argument ends this state and hides the hint.
export const HINT_TRIGGER = /(?:^|[\s￼])\/([a-z0-9:_-]+) $/i;

// Codex runs a slash command only when its "/" is the message's very first
// character; anywhere else, even after a leading space, the text goes to the
// model as a prompt. So for Codex both triggers are pinned to the prompt start.
const CODEX_SLASH_TRIGGER = /^\/([a-z0-9:_-]*)$/i;
const CODEX_HINT_TRIGGER = /^\/([a-z0-9:_-]+) $/i;

// The "/<frag>" being typed at the caret, or null when there is none the CLI
// would run. `before` is the prompt from its start up to the caret.
export function slashFragmentAt(cli: AICLI, before: string): string | null {
  return (cli === "codex" ? CODEX_SLASH_TRIGGER : SLASH_TRIGGER).exec(before)?.[1] ?? null;
}

// The command whose argument-hint should show: a completed "/<name> " at the
// caret, or null.
export function hintCommandAt(cli: AICLI, before: string): string | null {
  return (cli === "codex" ? CODEX_HINT_TRIGGER : HINT_TRIGGER).exec(before)?.[1] ?? null;
}

const AI_CLIS = AI_CLI_OPTIONS.map((o) => o.value);

// Identify which AI CLI a terminal runs from its launch command, by matching the
// basename of any token (split on whitespace and shell operators) against a known
// CLI name. Returns null for plain shells / unrecognized commands, which keeps
// the slash menu closed for terminals that aren't running an agent.
export function detectAICLI(cmd: string | undefined | null): AICLI | null {
  return findAICLI(cmd)?.cli ?? null;
}

// The same match, plus where the CLI's name ends in `cmd` — the point a
// launch flag can be spliced in at.
export function findAICLI(cmd: string | undefined | null): { cli: AICLI; end: number } | null {
  if (!cmd) return null;
  for (const m of cmd.matchAll(/[^\s;&|]+/g)) {
    const base = m[0].split("/").pop() ?? m[0];
    const hit = AI_CLIS.find((c) => c === base);
    if (hit) return { cli: hit, end: m.index + m[0].length };
  }
  return null;
}
