// A folder outside the project, listed under the path typed in the filter box.
import { folderAbove, joinPath } from "../../path";
import type { DirEntry, Item, TreeRow } from "./treeModel";

export const UP = "..";

export interface FolderList {
  // Absolute on the computer that holds the project.
  path: string;
  rows: TreeRow[];
  // Said under the rows.
  note: { text: string; bad?: boolean } | null;
  onOpen: (item: Item) => void;
  // Leaves for the folder it is in.
  onUp: () => void;
}

// A path typed so far: the folder it is in, up to the last separator, and the
// part of a name after that.
export function splitTyped(path: string, windows: boolean): { dir: string; name: string } {
  const cut = Math.max(path.lastIndexOf("/"), windows ? path.lastIndexOf("\\") : -1) + 1;
  return { dir: path.slice(0, cut), name: path.slice(cut) };
}

// `path` typed on as a folder, with its separator at the end.
export function asFolder(path: string, windows: boolean): string {
  if (splitTyped(path, windows).name === "") return path;
  return path + (windows && path.includes("\\") ? "\\" : "/");
}

// `/bin` can be a folder of the project's as well as the computer's own.
export function isTopLevel(path: string): boolean {
  return /^\/[^/]+\/?$/.test(path);
}

// Names that start with what is typed after the folder lead those that hold it.
function narrowed(entries: DirEntry[], narrow: string): DirEntry[] {
  const needle = narrow.toLowerCase();
  if (!needle) return entries;
  const starts = (e: DirEntry) => e.name.toLowerCase().startsWith(needle);
  const holds = (e: DirEntry) => !starts(e) && e.name.toLowerCase().includes(needle);
  return [...entries.filter(starts), ...entries.filter(holds)];
}

export function folderRows(dir: string, entries: DirEntry[], narrow: string): TreeRow[] {
  const row = (path: string, name: string, isDir: boolean): TreeRow => ({
    path,
    name,
    isDir,
    depth: 1,
    expanded: false,
    loading: false,
    error: null,
  });
  const above = narrow ? null : folderAbove(dir);
  const up = above === null ? [] : [row(above, UP, true)];
  return [...up, ...narrowed(entries, narrow).map((e) => row(joinPath(dir, e.name), e.name, e.isDir))];
}

// Where the keyboard starts: on what the folder holds rather than the way out.
export function firstRow(rows: readonly { name: string }[]): number {
  return rows.length > 1 && rows[0].name === UP ? 1 : 0;
}
