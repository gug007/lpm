import { FileExists, ListDirFiles } from "../../../bridge/commands";
import { basename, normalizePath } from "../../path";

// How long a project's file list answers link hovers and clicks before the
// next one walks the project again.
const FRESH_MS = 30_000;
// Hovering asks again for every row the pointer crosses, so a file's verdict
// is kept for a moment instead of asking the disk, or a paired Mac, each time.
const EXISTS_FRESH_MS = 3_000;

export interface FileIndex {
  paths: ReadonlySet<string>;
  byName: ReadonlyMap<string, readonly string[]>;
}

const cache = new Map<string, { at: number; index: Promise<FileIndex | null> }>();
const exists = new Map<string, { at: number; found: Promise<boolean> }>();

function build(raw: unknown): FileIndex {
  const paths = new Set<string>();
  const byName = new Map<string, string[]>();
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (entry?.isDir || typeof entry?.path !== "string") continue;
    paths.add(entry.path);
    const name = basename(entry.path);
    const same = byName.get(name);
    if (same) same.push(entry.path);
    else byName.set(name, [entry.path]);
  }
  return { paths, byName };
}

// The project's files, relative to its root: the same walk as the composer's
// @-mentions, shared by every terminal on that root. null when it can't be read.
export function loadFileIndex(root: string, maxAgeMs = FRESH_MS): Promise<FileIndex | null> {
  const hit = cache.get(root);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.index;
  const index = (ListDirFiles(root) as Promise<unknown>).then(build, () => null);
  cache.set(root, { at: Date.now(), index });
  return index;
}

// Whether an absolute path is a file, on whichever Mac its marker routes to.
export function fileExists(abs: string): Promise<boolean> {
  const now = Date.now();
  const hit = exists.get(abs);
  if (hit && now - hit.at < EXISTS_FRESH_MS) return hit.found;
  for (const [path, entry] of exists) if (now - entry.at >= EXISTS_FRESH_MS) exists.delete(path);
  const found = (FileExists(abs) as Promise<unknown>).then((v) => v === true, () => false);
  exists.set(abs, { at: now, found });
  return found;
}

export function forgetFileIndexes(): void {
  cache.clear();
  exists.clear();
}

const shallowFirst = (a: string, b: string) =>
  a.split("/").length - b.split("/").length || a.localeCompare(b);

// The project files a printed reference can mean, relative to the root: the
// path itself when it exists, else every file it is the tail of (a bare name
// is the tail of any file with that name). Git's a/ and b/ diff prefixes
// fall away. Empty when the index knows nothing better than the text as
// printed, which is then opened as is.
export function candidatesFor(index: FileIndex, printed: string): string[] {
  const rel = normalizePath(printed);
  if (!rel || rel.startsWith("../")) return [];
  if (index.paths.has(rel)) return [rel];
  const unprefixed = /^[ab]\//.test(rel) ? rel.slice(2) : null;
  if (unprefixed && index.paths.has(unprefixed)) return [unprefixed];
  const named = index.byName.get(basename(rel)) ?? [];
  const tail = `/${rel}`;
  return named.filter((p) => !rel.includes("/") || p.endsWith(tail)).sort(shallowFirst);
}
