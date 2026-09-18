// Pure state for the Files tab's tree: listings arrive one directory at a
// time, the user opens folders, and the visible rows are derived from both.

// What every list in the tab is made of: a project-relative path that is
// either a folder or a file.
export interface Item {
  path: string;
  isDir: boolean;
}

export interface DirEntry {
  name: string;
  isDir: boolean;
  isSymlink?: boolean;
  isIgnored?: boolean;
}

export type Listing =
  | { status: "loading" }
  | { status: "ready"; entries: DirEntry[] }
  | { status: "error"; message: string };

export interface TreeRow extends Item {
  name: string;
  depth: number;
  expanded: boolean;
  loading: boolean;
  error: string | null;
}

export function childPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

// Every folder above `path`, outermost first. The root ("") is implied.
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  let i = path.indexOf("/");
  while (i >= 0) {
    out.push(path.slice(0, i));
    i = path.indexOf("/", i + 1);
  }
  return out;
}

// The folders a change at `path` can have altered: the one holding it, and
// that folder's own parent, where it appears or disappears as an entry.
export function foldersTouchedBy(path: string): string[] {
  const dir = parentPath(path);
  return dir ? [dir, parentPath(dir)] : [""];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// Folders first, then files, each in natural order (file2 before file10) so the
// tree reads like Finder and VS Code.
function compareEntries(a: { name: string; isDir: boolean }, b: { name: string; isDir: boolean }): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

// The file `delta` places from the selected one in a list, clamped to the
// list's ends; with nothing selected, its first or last file.
export function adjacentFile(
  items: readonly Item[],
  selectedPath: string | null,
  delta: 1 | -1,
): string | null {
  const files = items.filter((it) => !it.isDir);
  if (files.length === 0) return null;
  const at = selectedPath ? files.findIndex((f) => f.path === selectedPath) : -1;
  if (at < 0) return files[delta > 0 ? 0 : files.length - 1].path;
  return files[Math.min(files.length - 1, Math.max(0, at + delta))].path;
}

export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort(compareEntries);
}

interface MatchNode {
  path: string;
  name: string;
  isDir: boolean;
  children: Map<string, MatchNode>;
}

const NO_PATHS: ReadonlySet<string> = new Set();

// The filter's matches as a pruned tree: every match sits under its folders,
// all of them open unless listed in `collapsed`, so a hit reads with its
// location instead of a path string.
export function buildMatchTree(
  matches: readonly Item[],
  collapsed: ReadonlySet<string> = NO_PATHS,
): TreeRow[] {
  const root: MatchNode = { path: "", name: "", isDir: true, children: new Map() };
  for (const match of matches) {
    const parts = match.path.split("/");
    let node = root;
    parts.forEach((name, i) => {
      let child = node.children.get(name);
      if (!child) {
        const last = i === parts.length - 1;
        child = {
          path: parts.slice(0, i + 1).join("/"),
          name,
          isDir: last ? match.isDir : true,
          children: new Map(),
        };
        node.children.set(name, child);
      }
      node = child;
    });
  }
  const rows: TreeRow[] = [];
  const walk = (node: MatchNode, depth: number) => {
    for (const child of [...node.children.values()].sort(compareEntries)) {
      const open = child.children.size > 0 && !collapsed.has(child.path);
      rows.push({
        path: child.path,
        name: child.name,
        isDir: child.isDir,
        depth,
        expanded: open,
        loading: false,
        error: null,
      });
      if (open) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

export function sameEntries(a: DirEntry[], b: DirEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (entry, i) =>
        entry.name === b[i].name &&
        entry.isDir === b[i].isDir &&
        !!entry.isIgnored === !!b[i].isIgnored,
    )
  );
}

// Every listed path git ignores, across the open folders.
export function ignoredPathsOf(listings: ReadonlyMap<string, Listing>): ReadonlySet<string> {
  const out = new Set<string>();
  for (const [dir, listing] of listings) {
    if (listing.status !== "ready") continue;
    for (const entry of listing.entries) {
      if (entry.isIgnored) out.add(childPath(dir, entry.name));
    }
  }
  return out;
}

// Depth-first walk of the open folders. A folder whose listing hasn't arrived
// shows as loading; one that failed keeps its row and carries the message.
export function flattenTree(
  listings: ReadonlyMap<string, Listing>,
  expanded: ReadonlySet<string>,
): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (dir: string, depth: number) => {
    const listing = listings.get(dir);
    if (!listing || listing.status !== "ready") return;
    for (const entry of listing.entries) {
      const path = childPath(dir, entry.name);
      const isOpen = entry.isDir && expanded.has(path);
      const child = isOpen ? listings.get(path) : undefined;
      rows.push({
        path,
        name: entry.name,
        isDir: entry.isDir,
        depth,
        expanded: isOpen,
        loading: isOpen && (!child || child.status === "loading"),
        error: isOpen && child?.status === "error" ? child.message : null,
      });
      if (isOpen) walk(path, depth + 1);
    }
  };
  walk("", 0);
  return rows;
}
