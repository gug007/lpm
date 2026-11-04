import type { SlashCommand } from "./slashCommands";

// lpm commands: prompts saved as files and run by typing `/name` in the
// composer. A project has its own list beside the global one; the shapes here
// mirror the Rust side (lpm_commands.rs).

export type CommandScope = "global" | "project";

export interface LpmCommand {
  name: string;
  folder: string | null;
  description: string;
  body: string;
  scope: CommandScope;
  // "<ticket>" for a prompt that asks for a ticket, shown after "/name ".
  argumentHint: string;
}

export interface CommandScopeList {
  folders: string[];
  commands: LpmCommand[];
}

export interface LpmCommandLists {
  global: CommandScopeList;
  // Null outside a project, or when its list couldn't be read (projectError).
  project: CommandScopeList | null;
  projectError: string | null;
}

export interface CommandRef {
  scope: CommandScope;
  folder: string | null;
  name: string;
}

export interface CommandInput extends CommandRef {
  description: string;
  body: string;
}

export interface ExpandedCommand {
  text: string;
  // Variables left as {{name}} in the text, to fill in before sending.
  missing: string[];
}

export const SCOPES: readonly CommandScope[] = ["project", "global"];

export const AUTO_VARIABLES = ["branch", "project", "dir"] as const;

export const NAME_RULE = "Letters, numbers, - and _, starting with a letter or number.";

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export function isValidCommandName(name: string): boolean {
  return NAME_RE.test(name);
}

export function scopeList(lists: LpmCommandLists, scope: CommandScope): CommandScopeList | null {
  return scope === "global" ? lists.global : lists.project;
}

// Both lists' commands, this project's first.
export function allCommands(lists: LpmCommandLists): LpmCommand[] {
  return [...(lists.project?.commands ?? []), ...lists.global.commands];
}

// What `/name` runs, in menu order: this project's commands, then global ones
// whose name the project doesn't already use.
export function effectiveCommands(lists: LpmCommandLists): LpmCommand[] {
  const seen = new Set<string>();
  const out: LpmCommand[] = [];
  for (const c of allCommands(lists)) {
    const key = c.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

export function findCommand(lists: LpmCommandLists, name: string): LpmCommand | null {
  const key = name.toLowerCase();
  return effectiveCommands(lists).find((c) => c.name.toLowerCase() === key) ?? null;
}

export function commandRef(c: CommandRef): CommandRef {
  return { scope: c.scope, folder: c.folder, name: c.name };
}

export function sameCommand(a: CommandRef | null, b: CommandRef | null): boolean {
  return !!a && !!b && a.scope === b.scope && a.folder === b.folder && a.name === b.name;
}

export function commandKey(c: CommandRef): string {
  return `${c.scope}:${c.folder ?? ""}:${c.name}`;
}

// The `/name args` a whole message is when it runs a command, or null.
export function parseCommandRun(text: string): { name: string; args: string } | null {
  const m = /^\s*\/([A-Za-z0-9][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(text);
  return m ? { name: m[1], args: (m[2] ?? "").trim() } : null;
}

// Each {{name}} in a prompt once, in order; split into the ones lpm fills in
// and the ones a run asks for.
export function promptVariables(body: string): { asks: string[]; auto: string[] } {
  const asks: string[] = [];
  const auto: string[] = [];
  for (const m of body.matchAll(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g)) {
    const name = m[1];
    const bucket = (AUTO_VARIABLES as readonly string[]).includes(name) ? auto : asks;
    if (!bucket.includes(name)) bucket.push(name);
  }
  return { asks, auto };
}

// Why a name won't run the command being edited, if it won't: this project's
// own command takes `/name` first, or this one hides a global one.
export function shadowNote(c: CommandRef, lists: LpmCommandLists): string | null {
  const key = c.name.toLowerCase();
  const named = (list: CommandScopeList | null) =>
    list?.commands.some((o) => o.name.toLowerCase() === key && !sameCommand(o, c)) ?? false;
  if (c.scope === "global" && named(lists.project)) {
    return `This project's own /${c.name} runs instead here.`;
  }
  if (c.scope === "project" && named(lists.global)) {
    return `Replaces your global /${c.name} in this project.`;
  }
  return null;
}

// The rows the composer's `/` menu shows for the lists: lpm commands first,
// carrying their folder and list, then the agent's own commands not hidden by
// one of them.
export function mergeSlashCommands(lists: LpmCommandLists, agent: SlashCommand[]): SlashCommand[] {
  const mine: SlashCommand[] = effectiveCommands(lists).map((c) => ({
    name: c.name,
    description: c.description,
    argumentHint: c.argumentHint,
    source: "lpm",
    folder: c.folder,
    scope: c.scope,
  }));
  const taken = new Set(mine.map((c) => c.name.toLowerCase()));
  return [...mine, ...agent.filter((c) => !taken.has(c.name.toLowerCase()))];
}

// The matched lpm commands, folder by folder in the menu's order, with the
// folders that hold a prefix match ahead of those with only a looser one.
export function rankLpmGroups(all: SlashCommand[], starts: Set<SlashCommand>, contains: Set<SlashCommand>): SlashCommand[] {
  const groups = new Map<string, { rank: number; rows: SlashCommand[] }>();
  for (const c of all) {
    if (c.source !== "lpm" || (!starts.has(c) && !contains.has(c))) continue;
    const key = `${c.scope}:${c.folder ?? ""}`;
    const group = groups.get(key) ?? { rank: 1, rows: [] };
    if (starts.has(c)) group.rank = 0;
    group.rows.push(c);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.rank - b.rank).flatMap((g) => g.rows);
}
