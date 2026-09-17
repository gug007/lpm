// Pure state for the Files tab's tree: listings arrive one directory at a
// time, the user opens folders, and the visible rows are derived from both.

export interface DirEntry {
  name: string;
  isDir: boolean;
  isSymlink?: boolean;
}

export type Listing =
  | { status: "loading" }
  | { status: "ready"; entries: DirEntry[] }
  | { status: "error"; message: string };

export interface TreeRow {
  path: string;
  name: string;
  isDir: boolean;
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

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
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

// The folders a change under `path` can have altered: its own folder and every
// one above it (a new folder shows up in its parent's listing).
export function foldersTouchedBy(path: string): string[] {
  return ["", ...ancestorsOf(path)];
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
