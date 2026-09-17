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
export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
}

export function sameEntries(a: DirEntry[], b: DirEntry[]): boolean {
  return (
    a.length === b.length &&
    a.every((entry, i) => entry.name === b[i].name && entry.isDir === b[i].isDir)
  );
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
