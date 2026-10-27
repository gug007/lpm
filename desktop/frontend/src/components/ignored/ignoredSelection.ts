// Which rows of the Sync Ignored Files tree are ticked to stay in sync.
//
// A selection is a set of paths, none inside another. A whole ignored folder is
// stored as the folder, so files added to it later come too; unticking one file
// inside replaces the folder with its other children. Folders git tracks are
// never stored — they only hold ignored entries, and ticking one ticks those.
import type { CheckState } from "../ChangedFilesTree";
import { indexTree, isEnvFile, isTracked, parentOf, units, unitsUnder, type TreeNode } from "./ignoredTree";

function covered(path: string, sel: ReadonlySet<string>): boolean {
  if (sel.has(path)) return true;
  for (let p = parentOf(path); p; p = parentOf(p)) if (sel.has(p)) return true;
  return false;
}

function holdsSome(path: string, sel: ReadonlySet<string>): boolean {
  if (!path.endsWith("/")) return false;
  for (const s of sel) if (s !== path && s.startsWith(path)) return true;
  return false;
}

export function tickOf(node: TreeNode, sel: ReadonlySet<string>): CheckState {
  if (isTracked(node)) {
    const ticks = unitsUnder(node).map((u) => tickOf(u, sel));
    if (ticks.length && ticks.every((t) => t === "all")) return "all";
    return ticks.some((t) => t !== "none") ? "some" : "none";
  }
  if (covered(node.path, sel)) return "all";
  return holdsSome(node.path, sel) ? "some" : "none";
}

function dropInside(sel: Set<string>, path: string) {
  if (!path.endsWith("/")) return;
  for (const s of [...sel]) if (s !== path && s.startsWith(path)) sel.delete(s);
}

function add(sel: Set<string>, path: string) {
  dropInside(sel, path);
  sel.add(path);
}

/// A folder whose children are all ticked becomes the folder itself, so files
/// added to it later come too.
function mergeUp(sel: Set<string>, path: string, index: Map<string, TreeNode>) {
  const parent = index.get(parentOf(path));
  if (!parent?.ignored || !parent.children || parent.more > 0) return;
  if (!parent.children.every((c) => sel.has(c.path))) return;
  add(sel, parent.path);
  mergeUp(sel, parent.path, index);
}

/// Untick `target` inside the ticked folder `from`: the folder is replaced by
/// its children, down the way to `target`, which is left out.
function split(sel: Set<string>, from: string, target: string, index: Map<string, TreeNode>) {
  sel.delete(from);
  let at = index.get(from);
  while (at && at.path !== target) {
    let next: TreeNode | undefined;
    for (const child of at.children ?? []) {
      if (target.startsWith(child.path)) next = child;
      else sel.add(child.path);
    }
    at = next;
  }
}

export function toggle(node: TreeNode, tree: TreeNode[], sel: ReadonlySet<string>): Set<string> {
  const next = new Set(sel);
  const index = indexTree(tree);
  const tick = tickOf(node, sel);
  if (isTracked(node)) {
    for (const u of unitsUnder(node)) {
      if (tick === "all") {
        dropInside(next, u.path);
        next.delete(u.path);
      } else add(next, u.path);
    }
    return next;
  }
  if (tick !== "all") {
    add(next, node.path);
    mergeUp(next, node.path, index);
  } else if (next.has(node.path)) {
    next.delete(node.path);
  } else {
    let from = parentOf(node.path);
    while (from && !next.has(from)) from = parentOf(from);
    if (from) split(next, from, node.path, index);
  }
  return next;
}

export function withEnvFiles(tree: TreeNode[], sel: ReadonlySet<string>): Set<string> {
  const next = new Set(sel);
  for (const u of units(tree)) if (isEnvFile(u)) add(next, u.path);
  return next;
}

/// The ticked paths, in a stable order.
export function selectedPaths(sel: ReadonlySet<string>): string[] {
  return [...sel].sort();
}
