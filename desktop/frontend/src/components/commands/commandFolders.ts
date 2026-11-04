import { pointerWithin, type CollisionDetection, type UniqueIdentifier } from "@dnd-kit/core";
import { scopeList, type CommandScope, type CommandScopeList, type LpmCommandLists } from "../../lpmCommands";

// A folder is the path to it: `Work/Reviews` sits inside `Work`, and each list
// names every level. Everything here works on those paths.

export const FOLDER_SEP = "/";

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

// The folder holding this one, null at the top of a list.
export function folderParent(folder: string): string | null {
  const at = folder.lastIndexOf(FOLDER_SEP);
  return at < 0 ? null : folder.slice(0, at);
}

// A folder's own name, without the folders it sits inside.
export function folderLabel(folder: string): string {
  return folder.slice(folder.lastIndexOf(FOLDER_SEP) + 1);
}

export function folderDepth(folder: string): number {
  return folder.split(FOLDER_SEP).length - 1;
}

export function childFolder(parent: string | null, name: string): string {
  return parent ? `${parent}${FOLDER_SEP}${name}` : name;
}

export function isInside(folder: string | null, parent: string): boolean {
  return !!folder?.startsWith(`${parent}${FOLDER_SEP}`);
}

// Each folder and all that it sits inside, parents first, once.
export function withParents(folders: string[]): string[] {
  const chain = (f: string): string[] => {
    const parent = folderParent(f);
    return parent ? [...chain(parent), f] : [f];
  };
  return [...new Set(folders.flatMap(chain))];
}

// Folders as the tree shows them, each followed by what's inside it.
export function inTreeOrder(folders: string[], parent: string | null = null): string[] {
  return folders.filter((f) => folderParent(f) === parent).flatMap((f) => [f, ...inTreeOrder(folders, f)]);
}

// What `folder` becomes when the folder `from` becomes `to`, null being the top
// of the list.
export function folderAfterMove(folder: string | null, from: string, to: string | null): string | null {
  if (folder === from) return to;
  if (folder === null || !isInside(folder, from)) return folder;
  return childFolder(to, folder.slice(from.length + 1));
}

// The folder a typed name means, `Parent/Child` naming one inside another: the
// list's own spelling of each level it has, since the list treats folder names the
// same whatever their case. Empty when it names no folder.
export function folderNamed(name: string, scope: CommandScope, lists: LpmCommandLists): string {
  const saved = scopeList(lists, scope)?.folders ?? [];
  return name
    .split(FOLDER_SEP)
    .map((level) => level.trim())
    .filter(Boolean)
    .reduce((parent, level) => {
      const path = childFolder(parent || null, level);
      return saved.find((f) => f.toLowerCase() === path.toLowerCase()) ?? path;
    }, "");
}

// A folder being dragged.
export interface DraggedFolder {
  scope: CommandScope;
  name: string;
}

// What a drop on `key` renames a folder to; null when it stays where it is, as it
// does dropped on itself or on a folder inside it. It can't change lists, where
// its other skills couldn't follow.
export function folderDrop(folder: DraggedFolder, key: FolderKey): string | null {
  const target = parseFolderKey(key);
  if (!target || target.scope !== folder.scope) return null;
  if (target.folder === folder.name || isInside(target.folder, folder.name)) return null;
  const moved = childFolder(target.folder, folderLabel(folder.name));
  return moved === folder.name ? null : moved;
}

// How many skills and folders sit in a folder, however deep.
export function heldCount(list: CommandScopeList, name: string): number {
  const skills = [...list.commands, ...(list.others ?? [])];
  return (
    skills.filter((c) => c.folder === name || isInside(c.folder ?? null, name)).length +
    list.folders.filter((f) => isInside(f, name)).length
  );
}

const LOOSE_ROW_INDENT = 8;
const FOLDER_ROW_INDENT = 6;
const NESTED_ROW_INDENT = 28;
const INDENT_STEP = 14;

// The left padding of a folder's row, by how many folders it sits inside.
export function folderIndent(depth: number): number {
  return FOLDER_ROW_INDENT + depth * INDENT_STEP;
}

// The left padding of a skill's row: 0 is in no folder, 1 in a top-level folder.
export function skillIndent(depth: number): number {
  return depth === 0 ? LOOSE_ROW_INDENT : NESTED_ROW_INDENT + (depth - 1) * INDENT_STEP;
}

// The smallest drop target under the pointer, since a folder inside another sits
// within its parent's.
export const innermostTarget: CollisionDetection = (args) => {
  const area = (id: UniqueIdentifier) => {
    const rect = args.droppableRects.get(id);
    return rect ? rect.width * rect.height : Infinity;
  };
  return pointerWithin(args).sort((a, b) => area(a.id) - area(b.id));
};
