// Pure state for the Sync Ignored Files tree: every computer's listing merged
// into one tree, and how each row compares between them. Which rows are ticked
// is ignoredSelection.ts.
import { folderName } from "../../path";
import type { IgnoredEntry, Listings, Prefer } from "./ignoredSyncApi";
import { listNames } from "./syncWords";

export interface Side {
  size: number;
  files: number;
  mtime: number;
  digest: string;
}

export interface TreeNode {
  path: string;
  name: string;
  dir: boolean;
  // False for a folder git tracks, shown only for the ignored entries in it.
  ignored: boolean;
  here?: Side;
  // Each other computer's, by its slug; missing where it has none.
  there: Record<string, Side>;
  // Null for an ignored folder not opened yet.
  children: TreeNode[] | null;
  // Children past the ones listed.
  more: number;
}

export type Tone = "green" | "amber" | "red" | "muted";

export interface Status {
  label: string;
  tone: Tone;
}

/// Whether the computers hold something different for a row.
export function differs(status: Status): boolean {
  return status.tone !== "muted";
}

export interface Peer {
  slug: string;
  name: string;
}

/// What a status reads against: this computer's name, the others being
/// synced, and the files the last round found changed both here and on one of
/// them, with its name.
export interface View {
  here: string;
  peers: Peer[];
  conflicts: ReadonlyMap<string, string>;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function parentOf(path: string): string {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const i = trimmed.lastIndexOf("/");
  return i < 0 ? "" : trimmed.slice(0, i + 1);
}

function sideOf(e: IgnoredEntry | undefined): Side | undefined {
  return e && { size: e.size, files: e.files, mtime: e.mtime, digest: e.digest };
}

function sortNodes(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => (a.dir === b.dir ? collator.compare(a.name, b.name) : a.dir ? -1 : 1));
}

interface Held {
  here?: IgnoredEntry;
  there: Record<string, IgnoredEntry>;
}

function merged(all: Listings, slugs: string[]): Map<string, Held> {
  const out = new Map<string, Held>();
  const at = (path: string) => out.get(path) ?? out.set(path, { there: {} }).get(path)!;
  for (const e of all.here.entries) at(e.path).here = e;
  for (const slug of slugs) for (const e of all.there[slug]?.entries ?? []) at(e.path).there[slug] = e;
  return out;
}

function entryNode(path: string, held: Held, loaded: Record<string, Listings>, slugs: string[]): TreeNode {
  const dir = (held.here ?? Object.values(held.there)[0]).dir;
  const opened = dir ? loaded[path] : undefined;
  const there = Object.fromEntries(Object.entries(held.there).map(([slug, e]) => [slug, sideOf(e)!]));
  return {
    path,
    name: folderName(path),
    dir,
    ignored: true,
    here: sideOf(held.here),
    there,
    children: opened ? childrenOf(opened, loaded, slugs) : null,
    more: opened ? Math.max(opened.here.more, ...slugs.map((s) => opened.there[s]?.more ?? 0)) : 0,
  };
}

function childrenOf(all: Listings, loaded: Record<string, Listings>, slugs: string[]): TreeNode[] {
  return sortNodes([...merged(all, slugs)].map(([path, held]) => entryNode(path, held, loaded, slugs)));
}

/// The tree the listings of this computer and the computers `slugs` make: the
/// project's ignored entries under the folders that hold them, and each opened
/// ignored folder's children.
export function buildTree(root: Listings, loaded: Record<string, Listings>, slugs: string[]): TreeNode[] {
  const top: TreeNode[] = [];
  const folders = new Map<string, TreeNode>();
  const holder = (path: string): TreeNode[] => {
    if (!path) return top;
    const known = folders.get(path);
    if (known) return known.children!;
    const folder: TreeNode = { path, name: folderName(path), dir: true, ignored: false, there: {}, children: [], more: 0 };
    folders.set(path, folder);
    holder(parentOf(path)).push(folder);
    return folder.children!;
  };
  for (const [path, held] of merged(root, slugs)) holder(parentOf(path)).push(entryNode(path, held, loaded, slugs));
  const sortAll = (nodes: TreeNode[]) => {
    sortNodes(nodes);
    nodes.forEach((n) => n.children && sortAll(n.children));
  };
  sortAll(top);
  return top;
}

export function indexTree(tree: TreeNode[]): Map<string, TreeNode> {
  const out = new Map<string, TreeNode>();
  const walk = (nodes: TreeNode[]) =>
    nodes.forEach((n) => {
      out.set(n.path, n);
      if (n.children) walk(n.children);
    });
  walk(tree);
  return out;
}

export const isTracked = (n: TreeNode) => n.dir && !n.ignored;

/// The ignored entries a tracked folder holds, at any depth, without going into
/// ignored folders.
export function unitsUnder(node: TreeNode): TreeNode[] {
  return (node.children ?? []).flatMap((c) => (isTracked(c) ? unitsUnder(c) : [c]));
}

export type Shown = Pick<Side, "size" | "files">;

function held(node: TreeNode): Side[] {
  return [node.here, ...Object.values(node.there)].filter((s): s is Side => !!s);
}

function biggest(node: TreeNode): Side | undefined {
  return held(node).reduce<Side | undefined>((a, s) => (a && a.size >= s.size ? a : s), undefined);
}

/// What a row's size shows: the biggest side; for a tracked folder, the
/// ignored entries in it added up.
export function shownSide(node: TreeNode): Shown | undefined {
  if (!isTracked(node)) return biggest(node);
  return unitsUnder(node)
    .map(biggest)
    .reduce<Shown>((a, s) => (s ? { size: a.size + s.size, files: a.files + s.files } : a), { size: 0, files: 0 });
}

export function statusOf(node: TreeNode, view: View): Status {
  if (isTracked(node)) return rollUp(unitsUnder(node).map((u) => statusOf(u, view)));
  const two = view.peers.length === 1;
  const conflict = view.conflicts.get(node.path);
  if (conflict) return { label: two ? "Changed on both" : `Changed here and on ${conflict}`, tone: "red" };
  const sides: [string, Side | undefined][] = [
    [view.here, node.here],
    ...view.peers.map((p): [string, Side | undefined] => [p.name, node.there[p.slug]]),
  ];
  const holding = sides.filter((s): s is [string, Side] => !!s[1]);
  if (holding.length === 1) return { label: `Only on ${holding[0][0]}`, tone: "green" };
  if (new Set(holding.map(([, s]) => s.digest)).size === 1) {
    if (holding.length === sides.length) return { label: two ? "Same on both" : "Same on all", tone: "muted" };
    return { label: `Not on ${listNames(sides.filter(([, s]) => !s).map(([name]) => name))}`, tone: "green" };
  }
  const newest = Math.max(...holding.map(([, s]) => s.mtime));
  const at = holding.filter(([, s]) => s.mtime === newest);
  if (node.dir || at.length > 1) return { label: two ? "Different on each" : "Not the same on all", tone: "amber" };
  return { label: `Newer on ${at[0][0]}`, tone: "amber" };
}

/// Whose version of a row that differs a sync keeps — "here" or a slug: the
/// picked computer's when it has one, else this computer's, else the newest.
export function keptSide(node: TreeNode, prefer: Prefer): string {
  const sides: [string, Side | undefined][] = [["here", node.here], ...Object.entries(node.there)];
  const holding = sides.filter((s): s is [string, Side] => !!s[1]);
  if (prefer !== "newest") {
    const first = holding.find(([k]) => k === prefer) ?? holding.find(([k]) => k === "here");
    if (first) return first[0];
  }
  return holding.reduce((a, s) => (s[1].mtime > a[1].mtime ? s : a))[0];
}

/// An .env file at least two computers hold, not the same on all of them.
export function canCompareEnv(node: TreeNode): boolean {
  const sides = held(node);
  return isEnvFile(node) && sides.length > 1 && new Set(sides.map((s) => s.digest)).size > 1;
}

function rollUp(statuses: Status[]): Status {
  if (new Set(statuses.map((s) => s.label)).size === 1) return statuses[0];
  if (statuses.some(differs)) return { label: "Some differ", tone: "amber" };
  return { label: "Nothing to copy", tone: "muted" };
}

/// Every entry the presets consider: what git ignores, never a tracked folder.
export function units(tree: TreeNode[]): TreeNode[] {
  return tree.flatMap((n) => (isTracked(n) ? unitsUnder(n) : [n]));
}

const SECRET_NAMES = [
  /^\.env(\..+)?$/i,
  /^\.envrc$/i,
  /^\.npmrc$/i,
  /\.local(\.[^.]+)?$/i,
  /\.(pem|key|crt|cer|p12|pfx|jks|keystore)$/i,
  /^(secrets?|certs?|keys|credentials)$/i,
  /^google-services\.json$/i,
  /^GoogleService-Info\.plist$/i,
];

/// Secrets and local config: what a project needs on the other computer to run.
export function isSecretName(name: string): boolean {
  return SECRET_NAMES.some((re) => re.test(name));
}

const HEAVY_NAMES = new Set([
  "node_modules", ".next", ".nuxt", ".turbo", ".parcel-cache", ".cache", "dist", "build", "out",
  "target", ".venv", "venv", "vendor", "Pods", ".gradle", "coverage", "__pycache__", "DerivedData",
]);

const SUGGEST_MAX_BYTES = 10 * 1024 * 1024;

/// What a project likely needs on every computer to run: secrets and local
/// config, never dependencies or build output.
export function suggested(tree: TreeNode[]): Set<string> {
  return new Set(
    units(tree)
      .filter((u) => isSecretName(u.name) && !HEAVY_NAMES.has(u.name))
      .filter((u) => (biggest(u)?.size ?? 0) <= SUGGEST_MAX_BYTES)
      .map((u) => u.path),
  );
}

export interface Row {
  node: TreeNode;
  depth: number;
  open: boolean;
  // The line after an opened folder's children that counts the ones not listed.
  more?: boolean;
}

/// The rows on screen: opened folders' children, or with a query, everything
/// loaded that matches and the folders that lead to it.
export function visibleRows(tree: TreeNode[], open: ReadonlySet<string>, query: string): Row[] {
  const q = query.trim().toLowerCase();
  const matches = (n: TreeNode): boolean =>
    n.path.toLowerCase().includes(q) || (n.children ?? []).some(matches);
  const rows: Row[] = [];
  const walk = (nodes: TreeNode[], depth: number) => {
    for (const node of nodes) {
      if (q && !matches(node)) continue;
      const isOpen = node.dir && (q ? (node.children ?? []).some(matches) : open.has(node.path));
      rows.push({ node, depth, open: isOpen });
      if (isOpen && node.children) walk(node.children, depth + 1);
      if (isOpen && node.more > 0) rows.push({ node, depth: depth + 1, open: false, more: true });
    }
  };
  walk(tree, 0);
  return rows;
}

/// The tracked folders, which start open: they hold nothing but ignored entries.
export function trackedFolders(tree: TreeNode[]): string[] {
  return [...indexTree(tree).values()].filter(isTracked).map((n) => n.path);
}

export interface Totals {
  // Files the ticked rows keep in sync, as the biggest side counts them.
  files: number;
  // Ticked rows the computers hold differently now.
  differ: number;
  heavy: string[];
  heavyBytes: number;
}

export function totalsOf(tree: TreeNode[], sel: ReadonlySet<string>, view: View): Totals {
  const index = indexTree(tree);
  const out: Totals = { files: 0, differ: 0, heavy: [], heavyBytes: 0 };
  for (const path of sel) {
    const node = index.get(path);
    if (!node) continue;
    const size = biggest(node)?.size ?? 0;
    out.files += Math.max(0, ...held(node).map((s) => s.files));
    if (differs(statusOf(node, view))) out.differ += 1;
    if (path.split("/").some((part) => HEAVY_NAMES.has(part))) {
      out.heavy.push(path);
      out.heavyBytes += size;
    }
  }
  return out;
}

export function isEnvFile(node: TreeNode): boolean {
  return !node.dir && /^\.env(\..+)?$|\.env$/i.test(node.name);
}
