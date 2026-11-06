import { AI_CLI_OPTIONS, type AICLI } from "./types";
import { commandName } from "./path";
import type { CommandScope } from "./lpmCommands";

// One slash command surfaced by the composer's autocomplete, mirroring the Rust
// AgentCommand returned by ListAgentCommands.
export interface SlashCommand {
  name: string; // no leading "/", e.g. "review" or "plugin:command"
  description: string;
  argumentHint: string;
  source: "builtin" | "project" | "user" | "lpm";
  // The folder a skill is filed in; absent for the agent's own commands.
  folder?: string | null;
  // An lpm command's list.
  scope?: CommandScope;
  // Its runs in the last 30 days and when it last ran (unix millis); absent
  // when there were none, or from a computer on an older lpm.
  recentRuns?: number;
  lastRunAt?: number;
  // Leads a lone "/" as one of the user's most used.
  mostUsed?: boolean;
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
    const base = commandName(m[0]);
    const hit = AI_CLIS.find((c) => c === base);
    if (hit) return { cli: hit, end: m.index + m[0].length };
  }
  return null;
}

const MOST_USED_ROWS = 5;

const recent = (c: SlashCommand) => c.recentRuns ?? 0;

function byName(a: SlashCommand, b: SlashCommand): number {
  const [x, y] = [a.name.toLowerCase(), b.name.toLowerCase()];
  return x < y ? -1 : x > y ? 1 : 0;
}

// What a lone "/" lists: the commands run most in the last 30 days, then every
// other one A–Z, so nothing depends on who made it.
function browseOrder(all: SlashCommand[]): SlashCommand[] {
  const top = all
    .filter((c) => recent(c) > 0)
    .sort((a, b) => recent(b) - recent(a) || (b.lastRunAt ?? 0) - (a.lastRunAt ?? 0) || byName(a, b))
    .slice(0, MOST_USED_ROWS);
  const rest = all.filter((c) => !top.includes(c)).sort(byName);
  return [...top.map((c) => ({ ...c, mostUsed: true })), ...rest];
}

// How well a row matches a typed fragment, best first; null when it doesn't.
function matchRank(c: SlashCommand, q: string): number | null {
  const name = c.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.split(/[-:_]/).some((word) => word.startsWith(q))) return 2;
  if (c.folder?.toLowerCase().startsWith(q)) return 3;
  if (name.includes(q)) return 4;
  return c.description.toLowerCase().includes(q) ? 5 : null;
}

// The rows a typed fragment keeps, best match first so it's the highlighted
// row, and among equal matches the one run most. An empty fragment (a lone "/")
// keeps every row so the menu is browsable.
export function filterSlashCommands(all: SlashCommand[], frag: string): SlashCommand[] {
  const q = frag.toLowerCase();
  if (!q) return browseOrder(all);
  const ranked: { c: SlashCommand; rank: number }[] = [];
  for (const c of all) {
    const rank = matchRank(c, q);
    if (rank !== null) ranked.push({ c, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || recent(b.c) - recent(a.c) || byName(a.c, b.c))
    .map(({ c }) => c);
}

function listName(c: SlashCommand): string | null {
  if (c.source === "builtin") return null;
  const global = c.source === "lpm" ? c.scope === "global" : c.source === "user";
  return global ? "Global" : "This project";
}

// A row's tag: a skill's folder (its last level), else its list. The agent's
// own commands have none, so the tags pick out what the user keeps.
export function slashTag(c: SlashCommand): string | null {
  return c.folder?.split("/").pop() || listName(c);
}

// Where a row lives, in full, for the selected row's details.
export function slashPlace(c: SlashCommand, agentLabel: string): string {
  const list = listName(c);
  if (!list) return agentLabel;
  return c.folder ? `${c.folder} · ${list}` : list;
}

// The command a message opens with, or null. A CLI only runs a "/" in that spot
// when it's the whole message's start, which is all a run count should see.
export function sentCommandName(text: string): string | null {
  return /^\s*\/([a-z0-9:_-]+)(?:\s|$)/i.exec(text)?.[1] ?? null;
}
