import {
  allCommands,
  commandKey,
  commandRef,
  effectiveCommands,
  isValidCommandName,
  NAME_RULE,
  sameCommand,
  scopeList,
  SCOPES,
  type CommandInput,
  type CommandRef,
  type CommandScope,
  type LpmCommand,
  type LpmCommandLists,
} from "../../lpmCommands";

// What the Commands tab shows: the folder picked in its left column, the
// commands in it, and the command being edited.

export const ALL_FOLDERS = "all";

// "all", or "<scope>:<folder>" with an empty folder for No folder.
export type FolderKey = string;

export function folderKey(scope: CommandScope, folder: string | null): FolderKey {
  return `${scope}:${folder ?? ""}`;
}

export function parseFolderKey(key: FolderKey): { scope: CommandScope; folder: string | null } | null {
  const at = key.indexOf(":");
  if (at < 0) return null;
  const scope = key.slice(0, at);
  if (scope !== "global" && scope !== "project") return null;
  const folder = key.slice(at + 1);
  return { scope, folder: folder || null };
}

export function inFolder(c: LpmCommand, key: FolderKey): boolean {
  return key === ALL_FOLDERS || folderKey(c.scope, c.folder) === key;
}

// How many commands each folder holds, under its key and ALL_FOLDERS.
export function folderCounts(lists: LpmCommandLists): Map<FolderKey, number> {
  const counts = new Map<FolderKey, number>();
  for (const c of allCommands(lists)) {
    for (const key of [ALL_FOLDERS, folderKey(c.scope, c.folder)]) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function visibleCommands(lists: LpmCommandLists, key: FolderKey, query: string): LpmCommand[] {
  const q = query.trim().toLowerCase();
  return allCommands(lists).filter(
    (c) =>
      inFolder(c, key) &&
      (!q || [c.name, c.description, c.body, c.folder ?? ""].some((s) => s.toLowerCase().includes(q))),
  );
}

export function scopeTitle(scope: CommandScope, projectLabel: string): string {
  return scope === "project" ? `This project · ${projectLabel}` : "Global";
}

export function folderTitle(key: FolderKey, projectLabel: string): string {
  const parsed = parseFolderKey(key);
  if (!parsed) return "All commands";
  const where = parsed.scope === "project" ? projectLabel : "global";
  return `${parsed.folder ?? "No folder"} · ${where}`;
}

// Where the file lives, as the user would find it.
export function commandPath(c: CommandRef): string {
  const root = c.scope === "project" ? ".lpm/commands" : "~/.lpm/commands";
  return `${root}/${c.folder ? `${c.folder}/` : ""}${c.name || "name"}.md`;
}

// The scopes this place has: global always, the project's own list when the
// terminal belongs to a project.
export function scopesOf(lists: LpmCommandLists): CommandScope[] {
  return SCOPES.filter((s) => s === "global" || lists.project !== null);
}

export interface Draft extends CommandInput {
  // The saved command this edits; null for a new one.
  original: CommandRef | null;
}

export function draftOf(c: LpmCommand): Draft {
  return {
    original: commandRef(c),
    scope: c.scope,
    folder: c.folder,
    name: c.name,
    description: c.description,
    body: c.body,
  };
}

export function newDraft(where: FolderKey, lists: LpmCommandLists, body = ""): Draft {
  const parsed = parseFolderKey(where);
  const scope: CommandScope = parsed?.scope ?? (lists.project ? "project" : "global");
  return { original: null, scope, folder: parsed?.folder ?? null, name: "", description: "", body };
}

export function isDirty(draft: Draft, lists: LpmCommandLists): boolean {
  if (!draft.original) return draft.name !== "" || draft.body.trim() !== "";
  const saved = allCommands(lists).find((c) => sameCommand(c, draft.original));
  if (!saved) return true;
  return (
    saved.scope !== draft.scope ||
    saved.folder !== draft.folder ||
    saved.name !== draft.name ||
    saved.description !== draft.description ||
    saved.body !== draft.body
  );
}

// Why the draft can't be saved yet, if it can't.
export function draftProblem(draft: Draft, lists: LpmCommandLists): string | null {
  if (!draft.name) return "Give it a name.";
  if (!isValidCommandName(draft.name)) return NAME_RULE;
  if (!draft.body.trim()) return "Write the prompt.";
  const key = draft.name.toLowerCase();
  const clash = scopeList(lists, draft.scope)?.commands.find(
    (c) => c.name.toLowerCase() === key && !sameCommand(c, draft.original),
  );
  if (clash) return `/${clash.name} already exists in ${clash.folder ? `the ${clash.folder} folder` : "No folder"}.`;
  return null;
}

// The command a drop on `key` turns `c` into, or null when it's already there
// or the other list already uses its name.
export function movedTo(c: LpmCommand, key: FolderKey, lists: LpmCommandLists): CommandInput | null {
  const target = parseFolderKey(key);
  if (!target || folderKey(c.scope, c.folder) === key) return null;
  if (target.scope !== c.scope) {
    const list = scopeList(lists, target.scope);
    if (!list || list.commands.some((o) => o.name.toLowerCase() === c.name.toLowerCase())) return null;
  }
  return { scope: target.scope, folder: target.folder, name: c.name, description: c.description, body: c.body };
}

// The commands `/name` runs here, by commandKey; one missing from it is hidden
// by a same-named command elsewhere.
export function runningKeys(lists: LpmCommandLists): Set<string> {
  return new Set(effectiveCommands(lists).map(commandKey));
}
