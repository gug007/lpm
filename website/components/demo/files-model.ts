// Pure state for the demo's Files tab. The app reads directories one at a time
// from disk; here the whole tree is canned, so a listing is derived from the
// project's flat path list instead of loaded.

export interface Item {
  path: string;
  isDir: boolean;
}

export interface TreeRow extends Item {
  name: string;
  depth: number;
  expanded: boolean;
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

/** Every folder above `path`, outermost first. The root ("") is implied. */
export function ancestorsOf(path: string): string[] {
  const out: string[] = [];
  let i = path.indexOf("/");
  while (i >= 0) {
    out.push(path.slice(0, i));
    i = path.indexOf("/", i + 1);
  }
  return out;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// Folders first, then files, each in natural order (file2 before file10) so the
// tree reads like Finder and VS Code.
function compareItems(a: Item, b: Item): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return collator.compare(basename(a.path), basename(b.path));
}

export type Listings = ReadonlyMap<string, Item[]>;

/** One entry per folder, from the project's flat list of file paths. */
export function buildListings(paths: readonly string[]): Listings {
  const children = new Map<string, Map<string, Item>>();
  const add = (dir: string, item: Item) => {
    let bucket = children.get(dir);
    if (!bucket) {
      bucket = new Map();
      children.set(dir, bucket);
    }
    bucket.set(item.path, item);
  };
  for (const path of paths) {
    add(parentPath(path), { path, isDir: false });
    for (const dir of ancestorsOf(path)) add(parentPath(dir), { path: dir, isDir: true });
  }
  const out = new Map<string, Item[]>();
  for (const [dir, bucket] of children) out.set(dir, [...bucket.values()].sort(compareItems));
  return out;
}

export function allFolders(listings: Listings): string[] {
  return [...listings.keys()].filter(Boolean);
}

/** Depth-first walk of the open folders. */
export function flattenTree(listings: Listings, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (dir: string, depth: number) => {
    for (const item of listings.get(dir) ?? []) {
      const open = item.isDir && expanded.has(item.path);
      rows.push({ ...item, name: basename(item.path), depth, expanded: open });
      if (open) walk(item.path, depth + 1);
    }
  };
  walk("", 0);
  return rows;
}

interface MatchNode {
  path: string;
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
  const root: MatchNode = { path: "", isDir: true, children: new Map() };
  for (const match of matches) {
    const parts = match.path.split("/");
    let node = root;
    parts.forEach((name, i) => {
      let child = node.children.get(name);
      if (!child) {
        const last = i === parts.length - 1;
        child = {
          path: parts.slice(0, i + 1).join("/"),
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
    for (const child of [...node.children.values()].sort(compareItems)) {
      const open = child.children.size > 0 && !collapsed.has(child.path);
      rows.push({
        path: child.path,
        isDir: child.isDir,
        name: basename(child.path),
        depth,
        expanded: open,
      });
      if (open) walk(child, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}
