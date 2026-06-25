import YAML from "yaml";
import { arrayMove } from "@dnd-kit/sortable";
import { ACTION_SECTIONS, findActionSection } from "./actionConfig";
import type { StructuralOp } from "./actionsGesture";

type Doc = ReturnType<typeof YAML.parseDocument>;
type MapNode = YAML.YAMLMap;

export interface EntryRef {
  section: string;
  map: MapNode;
  value: unknown; // scalar or map node
}

// Locate a top-level action entry across the actions:/terminals: sections.
export function findTopEntry(doc: Doc, key: string): EntryRef | null {
  const match = findActionSection(doc, key);
  if (!match) return null;
  return { section: match.section, map: match.node, value: match.node.get(key, true) };
}

function ensureSection(doc: Doc, section: string): MapNode {
  let node = doc.get(section, true);
  if (!YAML.isMap(node)) {
    doc.set(section, doc.createNode({}));
    node = doc.get(section, true);
  }
  return node as MapNode;
}

// A scalar shorthand (`name: cmd`) is widened to a map { cmd } so children
// have somewhere to attach. Returns the map node to mutate.
function asMap(doc: Doc, container: MapNode, key: string): MapNode {
  const value = container.get(key, true);
  if (YAML.isMap(value)) return value;
  if (YAML.isScalar(value) && typeof value.value === "string") {
    const widened = doc.createNode({ cmd: value.value }) as MapNode;
    container.set(key, widened);
    return widened;
  }
  const empty = doc.createNode({}) as MapNode;
  container.set(key, empty);
  return empty;
}

function childActionsMap(doc: Doc, parent: MapNode): MapNode {
  const existing = parent.get("actions", true);
  if (YAML.isMap(existing)) return existing;
  const created = doc.createNode({}) as MapNode;
  parent.set("actions", created);
  return created;
}

// Moves abort on a name collision instead of overwriting — a silent replace
// would permanently destroy the existing entry's config.
function conflictError(key: string): Error {
  return new Error(`an action named "${key}" already exists at the destination`);
}

function hasDefaultCmd(node: unknown): boolean {
  if (YAML.isScalar(node) && typeof node.value === "string") return true;
  if (YAML.isMap(node)) {
    const cmd = node.get("cmd", true) as YAML.Scalar | undefined;
    return !!cmd && typeof cmd.value === "string";
  }
  return false;
}

export interface PathEntry {
  section: string;
  parent: MapNode; // map holding `key` (a section map, or some node's `actions` map)
  key: string;
  value: unknown;
}

// Walk `a:b:c` from the top-level sections down through each node's `actions:`.
export function findEntryByPath(doc: Doc, path: string): PathEntry | null {
  const segs = path.split(":");
  const top = findTopEntry(doc, segs[0]);
  if (!top) return null;
  let parent: MapNode = top.map;
  let node: unknown = top.value;
  for (let i = 1; i < segs.length; i++) {
    if (!YAML.isMap(node)) return null;
    const acts = node.get("actions", true);
    if (!YAML.isMap(acts)) return null;
    parent = acts;
    node = acts.get(segs[i], true);
    if (node === undefined) return null;
  }
  return { section: top.section, parent, key: segs[segs.length - 1], value: node };
}

function peekChildrenOf(node: unknown): MapNode | null {
  if (!YAML.isMap(node)) return null;
  const children = node.get("actions", true);
  return YAML.isMap(children) ? children : null;
}

// Move a source entry (at any path depth) into target's nested actions: map.
export function nestEntry(doc: Doc, sourcePath: string, targetPath: string): void {
  if (sourcePath === targetPath) return;
  const source = findEntryByPath(doc, sourcePath);
  const target = findEntryByPath(doc, targetPath);
  if (!source || !target) return;
  const leaf = source.key;
  if (peekChildrenOf(target.value)?.has(leaf)) throw conflictError(leaf);
  const node = source.parent.get(source.key, true);
  source.parent.delete(source.key);
  const targetMap = asMap(doc, target.parent, target.key);
  childActionsMap(doc, targetMap).set(leaf, node);
}

// Remove a child node from its parent's nested actions: map; returns the
// detached node (or null). Does not collapse — call collapseMenu after.
function detachChild(doc: Doc, parentPath: string, childKey: string): unknown {
  const parent = findEntryByPath(doc, parentPath);
  if (!parent || !YAML.isMap(parent.value)) return null;
  const children = parent.value.get("actions", true);
  if (!YAML.isMap(children) || !children.has(childKey)) return null;
  const node = children.get(childKey, true);
  children.delete(childKey);
  return node;
}

export function collapseMenu(doc: Doc, parentPath: string): void {
  const parent = findEntryByPath(doc, parentPath);
  if (!parent || !YAML.isMap(parent.value)) return;
  const children = parent.value.get("actions", true);
  const childCount = YAML.isMap(children) ? children.items.length : 0;
  if (hasDefaultCmd(parent.value)) {
    if (childCount === 0) parent.value.delete("actions");
    return;
  }
  // A node with no cmd and no children is a dead empty button — remove it
  // from its parent entirely.
  if (childCount === 0) parent.parent.delete(parent.key);
}

export function extractToTop(doc: Doc, parentPath: string, childKey: string): void {
  if (findTopEntry(doc, childKey)) throw conflictError(childKey);
  const node = detachChild(doc, parentPath, childKey);
  if (node === null) return;
  const section = findEntryByPath(doc, parentPath)?.section ?? ACTION_SECTIONS[0];
  const sectionMap = ensureSection(doc, section);
  sectionMap.set(childKey, node);
  collapseMenu(doc, parentPath);
}

// Rebuild a child order with `child` pulled out and re-inserted on the
// indicated side of `over`. Returns null when `over` isn't present.
function positionedOrder(
  order: string[],
  child: string,
  over: string,
  position: "before" | "after",
): string[] | null {
  const without = order.filter((key) => key !== child);
  const at = without.indexOf(over);
  if (at < 0) return null;
  without.splice(position === "after" ? at + 1 : at, 0, child);
  return without;
}

// A pair's key is a Scalar when parsed from YAML, but a plain JS string when
// freshly `.set()` with a string key (as extractOnto's attach does).
function pairKeyString(pair: YAML.Pair): string | null {
  if (YAML.isScalar(pair.key)) return String(pair.key.value);
  if (typeof pair.key === "string") return pair.key;
  return null;
}

function childKeyOrder(children: MapNode): string[] {
  return children.items
    .map(pairKeyString)
    .filter((key): key is string => key !== null);
}

// Move a menu child directly into another item's children (at any depth), then
// collapse the source parent. With `over` + `position`, the child lands
// before/after that sibling in the target instead of being appended.
export function extractOnto(
  doc: Doc,
  parentPath: string,
  childKey: string,
  targetPath: string,
  over?: string,
  position?: "before" | "after",
): void {
  const target = findEntryByPath(doc, targetPath);
  if (!target) return;
  if (peekChildrenOf(target.value)?.has(childKey)) throw conflictError(childKey);
  const node = detachChild(doc, parentPath, childKey);
  if (node === null) return;
  const targetMap = asMap(doc, target.parent, target.key);
  const targetChildren = childActionsMap(doc, targetMap);
  targetChildren.set(childKey, node);
  if (over && position) {
    const next = positionedOrder(childKeyOrder(targetChildren), childKey, over, position);
    if (next) reorderMenu(doc, targetPath, next);
  }
  collapseMenu(doc, parentPath);
}

export function reorderMenu(doc: Doc, parentPath: string, order: string[]): void {
  const parent = findEntryByPath(doc, parentPath);
  if (!parent || !YAML.isMap(parent.value)) return;
  const children = parent.value.get("actions", true);
  if (!YAML.isMap(children)) return;
  const byKey = new Map<string, YAML.Pair>();
  for (const item of children.items) {
    const key = pairKeyString(item);
    if (key !== null) byKey.set(key, item);
  }
  const reordered: YAML.Pair[] = [];
  for (const key of order) {
    const pair = byKey.get(key);
    if (pair) {
      reordered.push(pair);
      byKey.delete(key);
    }
  }
  for (const leftover of byKey.values()) reordered.push(leftover);
  children.items = reordered;
  // The resolver sorts children by position (config.rs:1108) with a name
  // fallback, so key order alone is lost on reload — stamp explicit position.
  reordered.forEach((pair, i) => {
    const key = pairKeyString(pair);
    if (key === null) return;
    const childMap = asMap(doc, children, key);
    childMap.set("position", i + 1);
  });
}

// Dissolve the menu at `path`, promoting its children up into the node's own
// container. A node with a default cmd survives as a leaf (its actions drop);
// a pure menu is removed and its children take its slot.
export function ungroupMenu(doc: Doc, path: string): void {
  const entry = findEntryByPath(doc, path);
  if (!entry || !YAML.isMap(entry.value)) return;
  const node = entry.value;
  const parent = entry.parent;
  const idx = parent.items.findIndex((item) => item.value === node);
  if (idx < 0) return;

  const children = node.get("actions", true);
  const childPairs = YAML.isMap(children)
    ? children.items.filter((item) => YAML.isScalar(item.key))
    : [];
  const survives = hasDefaultCmd(node);

  for (const pair of childPairs) {
    const key = String((pair.key as YAML.Scalar).value);
    const clashesWithSibling = parent.items.some(
      (item) => item.value !== node && YAML.isScalar(item.key) && String(item.key.value) === key,
    );
    if (clashesWithSibling || (survives && key === entry.key)) throw conflictError(key);
  }

  if (survives) {
    node.delete("actions");
    parent.items.splice(idx + 1, 0, ...childPairs);
  } else {
    parent.items.splice(idx, 1, ...childPairs);
  }
}

// displayedChildren is the resolved display order of op.parent's children
// (leaf names) — supplied by the caller because it merges config layers,
// which a single doc can't reconstruct.
export function applyOpToDoc(doc: Doc, op: StructuralOp, displayedChildren?: string[]): void {
  switch (op.kind) {
    case "nest":
      nestEntry(doc, op.source, op.target);
      return;
    case "ungroup":
      ungroupMenu(doc, op.path);
      return;
    case "extractOnto":
      extractOnto(doc, op.parent, op.child, op.target, op.over, op.position);
      return;
    case "extractToTop":
      extractToTop(doc, op.parent, op.child);
      return;
    case "reorderMenu": {
      const order = displayedChildren ?? [];
      const from = order.indexOf(op.child);
      const overIdx = order.indexOf(op.over);
      if (from < 0 || overIdx < 0 || op.child === op.over) return;
      // Position-aware drop: rebuild the order with the dragged child pulled
      // out and re-inserted on the indicated side of the over child.
      if (op.position) {
        const next = positionedOrder(order, op.child, op.over, op.position);
        if (next) reorderMenu(doc, op.parent, next);
        return;
      }
      // Legacy swap-style: the dragged child takes over's slot (arrayMove).
      if (from === overIdx) return;
      reorderMenu(doc, op.parent, arrayMove(order, from, overIdx));
      return;
    }
  }
}
