import type { SlashCommand } from "./slashCommands";

// lpm skills: prompts saved as Agent Skills and run by typing `/name` in the
// composer. A project has its own list beside the global one; the shapes here
// mirror the Rust side (lpm_commands.rs), whose names the wire keeps.

export type CommandScope = "global" | "project";

export interface LpmCommand {
  name: string;
  folder: string | null;
  description: string;
  body: string;
  scope: CommandScope;
  // "<ticket>" for a prompt that asks for a ticket, shown after "/name ".
  argumentHint: string;
  // Git ignores it and holds none of its files. Absent from a computer on an older lpm.
  keptOutOfGit?: boolean;
  // Git holds some of its files. Absent from a computer on an older lpm.
  tracked?: boolean;
  // Its SKILL.md on the computer that holds the list. Absent from an older lpm.
  path?: string;
  // How often it ran on that computer and when last (unix millis); absent
  // before its first run.
  runs?: number;
  lastRunAt?: number;
  // Its runs in the last 30 days; absent when there were none.
  recentRuns?: number;
}

// A skill in this list's places that wasn't made in lpm. Shown, never changed.
export interface OtherSkill {
  name: string;
  description: string;
  // The start of its instructions; Agent setup has the whole file.
  preview: string;
  agents: string[];
  path: string;
  // Absent from a computer on an older lpm.
  folder?: string | null;
  // Shown with the skills in no folder, out of the Other skills group.
  atRoot?: boolean;
}

export interface CommandScopeList {
  folders: string[];
  commands: LpmCommand[];
  // Absent from a computer on an older lpm.
  others?: OtherSkill[];
  // The list belongs to a git repo. Absent from a computer on an older lpm.
  inRepo?: boolean;
}

export interface LpmCommandLists {
  global: CommandScopeList;
  // Null outside a project, or when its list couldn't be read (projectError).
  project: CommandScopeList | null;
  projectError: string | null;
  // Absent from a computer on an older lpm.
  folds?: SkillFolds;
  // The recent runs of the `/` commands that aren't lpm skills, by lowercase
  // name. Absent from a computer on an older lpm.
  agentRuns?: Record<string, { recentRuns: number; lastRunAt: number }>;
}

export interface ListFolds {
  closed: string[];
  othersOpen: boolean;
}

export type SkillFolds = Record<CommandScope, ListFolds>;

const NOTHING_FOLDED: ListFolds = { closed: [], othersOpen: false };
export const NO_FOLDS: SkillFolds = { global: NOTHING_FOLDED, project: NOTHING_FOLDED };

// No folder means the list's Other skills group. Sorted as the saved file is.
export function withFold(list: ListFolds, folder: string | null, open: boolean): ListFolds {
  if (folder === null) return { ...list, othersOpen: open };
  const others = list.closed.filter((name) => name !== folder);
  return { ...list, closed: open ? others : [...others, folder].sort() };
}

export interface CommandRef {
  scope: CommandScope;
  folder: string | null;
  name: string;
}

export interface CommandInput extends CommandRef {
  description: string;
  body: string;
  // Left out, the skill stays as it is.
  keepOutOfGit?: boolean;
}

export interface ExpandedCommand {
  text: string;
  // Variables left as {{name}} in the text, to fill in before sending.
  missing: string[];
}

export const SCOPES: readonly CommandScope[] = ["project", "global"];

export const AUTO_VARIABLES = ["branch", "project", "dir"] as const;

export const NAME_RULE = "Lowercase letters, numbers and single hyphens.";

const MAX_NAME_LENGTH = 64;
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidCommandName(name: string): boolean {
  return name.length <= MAX_NAME_LENGTH && NAME_RE.test(name);
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

const VARIABLE_RE = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

export function isAutoVariable(name: string): boolean {
  return (AUTO_VARIABLES as readonly string[]).includes(name);
}

// Where each {{name}} sits in a prompt, for an editor to mark.
export function variableSpans(body: string): { start: number; end: number; name: string; auto: boolean }[] {
  return [...body.matchAll(VARIABLE_RE)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
    name: m[1],
    auto: isAutoVariable(m[1]),
  }));
}

// Each {{name}} in a prompt once, in order; split into the ones lpm fills in
// and the ones a run asks for.
export function promptVariables(body: string): { asks: string[]; auto: string[] } {
  const asks: string[] = [];
  const auto: string[] = [];
  for (const m of body.matchAll(VARIABLE_RE)) {
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

// The folder a skill made elsewhere is filed in, in the list its row comes from.
function otherFolder(lists: LpmCommandLists, c: SlashCommand): string | null | undefined {
  const list = c.source === "project" ? lists.project : c.source === "user" ? lists.global : null;
  return list?.others?.find((o) => o.name === c.name)?.folder;
}

// The rows the composer's `/` menu holds for the lists: lpm skills, carrying
// their folder and list, and the agent's own commands not hidden by one of them,
// each with its recent runs. filterSlashCommands puts them in order.
export function mergeSlashCommands(lists: LpmCommandLists, agent: SlashCommand[]): SlashCommand[] {
  const mine: SlashCommand[] = effectiveCommands(lists).map((c) => ({
    name: c.name,
    description: c.description,
    argumentHint: c.argumentHint,
    source: "lpm",
    folder: c.folder,
    scope: c.scope,
    recentRuns: c.recentRuns,
    lastRunAt: c.lastRunAt,
  }));
  const taken = new Set(mine.map((c) => c.name.toLowerCase()));
  const theirs = agent
    .filter((c) => !taken.has(c.name.toLowerCase()))
    .map((c) => ({ ...c, folder: otherFolder(lists, c), ...lists.agentRuns?.[c.name.toLowerCase()] }));
  return [...mine, ...theirs];
}
