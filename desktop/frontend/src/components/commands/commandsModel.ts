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
import {
  folderAfterMove,
  folderDepth,
  folderKey,
  folderLabel,
  folderParent,
  inTreeOrder,
  parseFolderKey,
  withParents,
  type FolderKey,
} from "./commandFolders";

// What the Skills tab shows: both lists as one tree of folders and skills, and
// the skill being edited.

export interface TreeFolder {
  // The whole path, which is what the list calls it.
  name: string;
  label: string;
  depth: number;
  key: FolderKey;
  commands: LpmCommand[];
  others: OtherSkill[];
  children: TreeFolder[];
  // The skills in it and in the folders inside it.
  total: number;
}

export interface TreeScope {
  scope: CommandScope;
  folders: TreeFolder[];
  loose: LpmCommand[];
  // The other skills in the Other skills group.
  others: OtherSkill[];
  // The other skills kept with `loose`.
  rootOthers: OtherSkill[];
  count: number;
}

// What a row in the tree can ask for, passed down unchanged.
export interface SkillRowActions {
  onSelectOther: (scope: CommandScope, skill: OtherSkill) => void;
  onConvert: (scope: CommandScope, name: string, toLpm: boolean) => void;
  onOpenInAgentSetup: (skill: OtherSkill) => void;
  onMoveOther: (scope: CommandScope, name: string, spot: OtherSpot) => void;
  foldersOf: (scope: CommandScope) => string[];
}

// What a folder's row can ask for, in one list, passed down the tree unchanged.
export interface FolderRowActions {
  isOpen: (key: FolderKey) => boolean;
  onToggle: (key: FolderKey) => void;
  onSelect: (c: LpmCommand) => void;
  onNew: (where: CommandPlace) => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (name: string, newName: string) => void;
  onDeleteFolder: (name: string) => void;
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
    const paths = withParents(list.folders);
    const inside = (parent: string | null): TreeFolder[] =>
      paths
        .filter((path) => folderParent(path) === parent)
        .map((path) => node(path))
        .filter((f) => !q || f.total > 0);
    const node = (path: string): TreeFolder => {
      const commands = shown.filter((c) => c.folder === path);
      const held = others.filter((o) => o.folder === path);
      const children = inside(path);
      return {
        name: path,
        label: folderLabel(path),
        depth: folderDepth(path),
        key: folderKey(scope, path),
        commands,
        others: held,
        children,
        total: commands.length + held.length + children.reduce((n, f) => n + f.total, 0),
      };
    };
    const folders = inside(null);
    return [
      {
        scope,
        folders,
        loose: shown.filter((c) => c.folder === null),
        others: others.filter((o) => !o.folder && !o.atRoot),
        rootOthers: others.filter((o) => !o.folder && o.atRoot),
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

// The places a skill can go in one list: no folder, then each folder in tree
// order. A folder the draft names that isn't saved yet is listed too, so the choice
// stays visible.
export interface PlaceChoices {
  scope: CommandScope;
  folders: (string | null)[];
}

export function placeChoices(place: CommandPlace, lists: LpmCommandLists): PlaceChoices[] {
  return scopesOf(lists).map((scope) => {
    const saved = scopeList(lists, scope)!.folders;
    const pending = place.scope === scope && place.folder ? [place.folder] : [];
    return { scope, folders: [null, ...inTreeOrder(withParents([...saved, ...pending]))] };
  });
}

export interface Draft extends CommandInput {
  // The saved command this edits; null for a new one.
  original: CommandRef | null;
  keepOutOfGit: boolean;
}

export function draftOf(c: LpmCommand): Draft {
  return {
    original: commandRef(c),
    scope: c.scope,
    folder: c.folder,
    name: c.name,
    description: c.description,
    body: c.body,
    keepOutOfGit: !!c.keptOutOfGit,
  };
}

// A new command in `where`, or at the top of the project's list (the global
// one outside a project) when no place is given.
export function newDraft(where: CommandPlace | null, lists: LpmCommandLists, body = ""): Draft {
  const scope: CommandScope = where?.scope ?? (lists.project ? "project" : "global");
  return { original: null, scope, folder: where?.folder ?? null, name: "", description: "", body, keepOutOfGit: false };
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
    saved.body !== draft.body ||
    (canKeepOutOfGit(draft, lists) && !!saved.keptOutOfGit !== draft.keepOutOfGit)
  );
}

// Only a project's skills live in its repo, and an older lpm can't keep one out.
export function canKeepOutOfGit(place: CommandPlace, lists: LpmCommandLists): boolean {
  return place.scope === "project" && !!lists.project?.inRepo;
}

// What keeping a committed skill out of Git will do, said before it's saved.
export function keptOutNote(draft: Draft, lists: LpmCommandLists): string | null {
  if (!draft.keepOutOfGit || !draft.original) return null;
  const saved = allCommands(lists).find((c) => sameCommand(c, draft.original));
  if (!saved?.tracked) return null;
  return "Already committed. After saving, commit to remove it from the repo. Past commits keep a copy, and other computers lose it when they pull.";
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

// The editor's draft once the folder `from` of `scope` has become `to`.
export function draftAfterFolderMove(draft: Draft, scope: CommandScope, from: string, to: string | null): Draft {
  const { original } = draft;
  return {
    ...draft,
    folder: draft.scope === scope ? folderAfterMove(draft.folder, from, to) : draft.folder,
    original:
      original?.scope === scope ? { ...original, folder: folderAfterMove(original.folder, from, to) } : original,
  };
}

// Where another skill shows: in a folder, with the skills in no folder (`root`),
// or with neither in the Other skills group. Its file doesn't change for any.
export interface OtherSpot {
  folder: string | null;
  root: boolean;
}

export function otherSpotOf(o: OtherSkill): OtherSpot {
  return { folder: o.folder ?? null, root: !o.folder && !!o.atRoot };
}

export function sameSpot(a: OtherSpot, b: OtherSpot): boolean {
  return a.folder === b.folder && a.root === b.root;
}

// Where a drop on `key` puts another skill; undefined when it's there already. Its
// file stays where it is, so it can't change lists: a folder of the other list
// means the folder of that name in its own, made if need be.
export function otherDrop(
  o: OtherSkill,
  scope: CommandScope,
  key: FolderKey,
  intoGroup: boolean,
): OtherSpot | undefined {
  const target = parseFolderKey(key);
  if (!target || (target.scope !== scope && target.folder === null)) return undefined;
  const spot = { folder: target.folder, root: target.folder === null && !intoGroup };
  return sameSpot(spot, otherSpotOf(o)) ? undefined : spot;
}

// The commands `/name` runs here, by commandKey; one missing from it is hidden
// by a same-named command elsewhere.
export function runningKeys(lists: LpmCommandLists): Set<string> {
  return new Set(effectiveCommands(lists).map(commandKey));
}
