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
  type OtherSkill,
} from "../../lpmCommands";
import { AI_CLI_OPTIONS } from "../../types";

// What the Skills tab shows: both lists as one tree of folders and skills, and
// the skill being edited.

// "<scope>:<folder>", with an empty folder for a command in no folder.
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

export interface TreeFolder {
  name: string;
  key: FolderKey;
  commands: LpmCommand[];
  others: OtherSkill[];
}

export interface TreeScope {
  scope: CommandScope;
  folders: TreeFolder[];
  loose: LpmCommand[];
  // The other skills in no folder.
  others: OtherSkill[];
  count: number;
}

// What a row in the tree can ask for, passed down unchanged.
export interface SkillRowActions {
  onSelectOther: (scope: CommandScope, skill: OtherSkill) => void;
  onConvert: (scope: CommandScope, name: string, toLpm: boolean) => void;
  onOpenInAgentSetup: (skill: OtherSkill) => void;
}

function matchesOther(o: OtherSkill, q: string): boolean {
  return [o.name, o.description].some((s) => s.toLowerCase().includes(q));
}

function matches(c: LpmCommand, q: string): boolean {
  return [c.name, c.description, c.body, c.folder ?? ""].some((s) => s.toLowerCase().includes(q));
}

// The tab's tree: each list with its folders and their commands, then the
// commands in no folder. A search keeps only the commands it matches, the
// folders holding them and the lists it found something in.
export function commandTree(lists: LpmCommandLists, query: string): TreeScope[] {
  const q = query.trim().toLowerCase();
  return scopesOf(lists).flatMap((scope) => {
    const list = scopeList(lists, scope)!;
    const shown = q ? list.commands.filter((c) => matches(c, q)) : list.commands;
    const others = (list.others ?? []).filter((o) => !q || matchesOther(o, q));
    if (q && shown.length === 0 && others.length === 0) return [];
    const folders = list.folders
      .map((name) => ({
        name,
        key: folderKey(scope, name),
        commands: shown.filter((c) => c.folder === name),
        others: others.filter((o) => o.folder === name),
      }))
      .filter((f) => !q || f.commands.length + f.others.length > 0);
    return [
      {
        scope,
        folders,
        loose: shown.filter((c) => c.folder === null),
        others: others.filter((o) => !o.folder),
        count: shown.length,
      },
    ];
  });
}

// One other skill, by the list that shows it.
export interface OtherPlace {
  scope: CommandScope;
  name: string;
}

export function otherKey(scope: CommandScope, name: string): string {
  return `other:${scope}:${name}`;
}

export function findOther(lists: LpmCommandLists, place: OtherPlace): OtherSkill | null {
  return scopeList(lists, place.scope)?.others?.find((o) => o.name === place.name) ?? null;
}

// Every agent lpm knows, and whether it reads a skill that `agents` name.
export function agentReach(agents: string[]): { label: string; reads: boolean }[] {
  return AI_CLI_OPTIONS.map((o) => ({ label: o.label, reads: agents.includes(o.value) }));
}

export function scopeTitle(scope: CommandScope, projectLabel: string): string {
  return scope === "project" ? `This project · ${projectLabel}` : "Global";
}

// Where the file lives, as the user would find it.
export function commandPath(c: CommandRef): string {
  const root = c.scope === "project" ? ".agents/skills" : "~/.agents/skills";
  return `${root}/${c.name || "name"}/SKILL.md`;
}

// The scopes this place has: global always, the project's own list when the
// terminal belongs to a project.
export function scopesOf(lists: LpmCommandLists): CommandScope[] {
  return SCOPES.filter((s) => s === "global" || lists.project !== null);
}

// A list and a folder in it (null for the top level).
export type CommandPlace = Pick<CommandInput, "scope" | "folder">;

// The places a skill can go in one list: no folder, then each folder. A folder
// the draft names that isn't saved yet is listed too, so the choice stays visible.
export interface PlaceChoices {
  scope: CommandScope;
  folders: (string | null)[];
}

export function placeChoices(place: CommandPlace, lists: LpmCommandLists): PlaceChoices[] {
  return scopesOf(lists).map((scope) => {
    const saved = scopeList(lists, scope)!.folders;
    const pending = place.scope === scope && place.folder && !saved.includes(place.folder);
    return { scope, folders: [null, ...saved, ...(pending ? [place.folder] : [])] };
  });
}

// The folder a typed name means: the list's own spelling when it has one, since
// the list treats folder names the same whatever their case.
export function folderNamed(name: string, scope: CommandScope, lists: LpmCommandLists): string {
  const key = name.toLowerCase();
  return scopeList(lists, scope)?.folders.find((f) => f.toLowerCase() === key) ?? name;
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

// A new command in `where`, or at the top of the project's list (the global
// one outside a project) when no place is given.
export function newDraft(where: CommandPlace | null, lists: LpmCommandLists, body = ""): Draft {
  const scope: CommandScope = where?.scope ?? (lists.project ? "project" : "global");
  return { original: null, scope, folder: where?.folder ?? null, name: "", description: "", body };
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

// The folder a drop on `key` files another skill in; undefined when it's there
// already. Its file stays where it is, so it can't change lists.
export function otherDropFolder(o: OtherSkill, scope: CommandScope, key: FolderKey): string | null | undefined {
  const target = parseFolderKey(key);
  if (!target || target.scope !== scope || target.folder === (o.folder ?? null)) return undefined;
  return target.folder;
}

// The commands `/name` runs here, by commandKey; one missing from it is hidden
// by a same-named command elsewhere.
export function runningKeys(lists: LpmCommandLists): Set<string> {
  return new Set(effectiveCommands(lists).map(commandKey));
}
