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

function peekChildren(container: MapNode, key: string): MapNode | null {
  const value = container.get(key, true);
  if (!YAML.isMap(value)) return null;
  const children = value.get("actions", true);
  return YAML.isMap(children) ? children : null;
}

function attachChild(doc: Doc, target: EntryRef, targetKey: string, childKey: string, node: unknown): void {
  const targetMap = asMap(doc, target.map, targetKey);
  childActionsMap(doc, targetMap).set(childKey, node);
}

// Move a top-level source entry into target's nested actions: map.
// Used for leaf->leaf (target widens to split menu) and leaf->menu.
export function nestEntry(doc: Doc, sourceKey: string, targetKey: string): void {
  if (sourceKey === targetKey) return;
  const source = findTopEntry(doc, sourceKey);
  const target = findTopEntry(doc, targetKey);
  if (!source || !target) return;
  if (peekChildren(target.map, targetKey)?.has(sourceKey)) throw conflictError(sourceKey);
  const sourceNode = source.map.get(sourceKey, true);
  source.map.delete(sourceKey);
  attachChild(doc, target, targetKey, sourceKey, sourceNode);
}

// Spread a source menu into target: its default (if any) becomes a regular
// child, its existing children move up as equal items, source is removed.
export function mergeMenu(doc: Doc, sourceKey: string, targetKey: string): void {
  if (sourceKey === targetKey) return;
  const source = findTopEntry(doc, sourceKey);
  const target = findTopEntry(doc, targetKey);
  if (!source || !target) return;

  const sourceNode = source.map.get(sourceKey, true);
  const childMap = YAML.isMap(sourceNode) ? sourceNode.get("actions", true) : null;
  const incoming: string[] = [];
  if (YAML.isMap(childMap)) {
    for (const item of childMap.items) {
      if (YAML.isScalar(item.key)) incoming.push(String(item.key.value));
    }
  }
  if (hasDefaultCmd(sourceNode)) incoming.push(sourceKey);
  const existing = peekChildren(target.map, targetKey);
  const seen = new Set<string>();
  for (const key of incoming) {
    if (seen.has(key) || existing?.has(key)) throw conflictError(key);
    seen.add(key);
  }

  const targetMap = asMap(doc, target.map, targetKey);
  const dest = childActionsMap(doc, targetMap);

  if (YAML.isMap(sourceNode)) {
    sourceNode.delete("actions");
    if (hasDefaultCmd(sourceNode)) dest.set(sourceKey, sourceNode);
    if (YAML.isMap(childMap)) {
      for (const item of childMap.items) {
        if (YAML.isScalar(item.key)) dest.set(item.key.value as string, item.value);
      }
    }
  } else if (YAML.isScalar(sourceNode) && typeof sourceNode.value === "string") {
    dest.set(sourceKey, sourceNode);
  }
  source.map.delete(sourceKey);
}

function hasDefaultCmd(node: unknown): boolean {
  if (YAML.isScalar(node) && typeof node.value === "string") return true;
  if (YAML.isMap(node)) {
    const cmd = node.get("cmd", true) as YAML.Scalar | undefined;
    return !!cmd && typeof cmd.value === "string";
  }
  return false;
}

// Remove a child node from its parent's nested actions: map; returns the
// detached node (or null). Does not collapse — call collapseMenu after.
function detachChild(doc: Doc, parentKey: string, childKey: string): unknown {
  const parent = findTopEntry(doc, parentKey);
  if (!parent || !YAML.isMap(parent.value)) return null;
  const children = parent.value.get("actions", true);
  if (!YAML.isMap(children) || !children.has(childKey)) return null;
  const node = children.get(childKey, true);
  children.delete(childKey);
  return node;
}

// Collapse the parent if it now has fewer than 2 selectable entries.
export function collapseMenu(doc: Doc, parentKey: string): void {
  const parent = findTopEntry(doc, parentKey);
  if (!parent || !YAML.isMap(parent.value)) return;
  const children = parent.value.get("actions", true);
  const childCount = YAML.isMap(children) ? children.items.length : 0;
  const count = (hasDefaultCmd(parent.value) ? 1 : 0) + childCount;
  if (count >= 2) return;

  if (hasDefaultCmd(parent.value)) {
    parent.value.delete("actions"); // split menu -> plain button
    return;
  }
  // Pure dropdown with one survivor: replace parent with that child.
  if (YAML.isMap(children) && children.items.length === 1) {
    const only = children.items[0];
    if (YAML.isScalar(only.key)) {
      const survivorKey = String(only.key.value);
      // Collapse runs after the primary move already mutated the doc, so a
      // collision can't abort the op — keep the one-item menu instead.
      if (survivorKey !== parentKey && findTopEntry(doc, survivorKey)) return;
      parent.map.delete(parentKey);
      parent.map.set(survivorKey, only.value);
    }
  }
}

export function extractToTop(doc: Doc, parentKey: string, childKey: string): void {
  if (findTopEntry(doc, childKey)) throw conflictError(childKey);
  const node = detachChild(doc, parentKey, childKey);
  if (node === null) return;
  const section = findTopEntry(doc, parentKey)?.section ?? ACTION_SECTIONS[0];
  const sectionMap = ensureSection(doc, section);
  sectionMap.set(childKey, node);
  collapseMenu(doc, parentKey);
}

// Move a menu child directly into another top-level item's children, then
// collapse the source parent.
export function extractOnto(
  doc: Doc,
  parentKey: string,
  childKey: string,
  targetKey: string,
): void {
  const target = findTopEntry(doc, targetKey);
  if (!target) return;
  if (peekChildren(target.map, targetKey)?.has(childKey)) throw conflictError(childKey);
  const node = detachChild(doc, parentKey, childKey);
  if (node === null) return;
  attachChild(doc, target, targetKey, childKey, node);
  collapseMenu(doc, parentKey);
}

export function reorderMenu(doc: Doc, parentKey: string, order: string[]): void {
  const parent = findTopEntry(doc, parentKey);
  if (!parent || !YAML.isMap(parent.value)) return;
  const children = parent.value.get("actions", true);
  if (!YAML.isMap(children)) return;
  const byKey = new Map<string, YAML.Pair>();
  for (const item of children.items) {
    if (YAML.isScalar(item.key)) byKey.set(String(item.key.value), item);
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
    const childMap = asMap(doc, children, String((pair.key as YAML.Scalar).value));
    childMap.set("position", i + 1);
  });
}

// displayedChildren is the resolved display order of op.parent's children
// (leaf names) — supplied by the caller because it merges config layers,
// which a single doc can't reconstruct.
export function applyOpToDoc(doc: Doc, op: StructuralOp, displayedChildren?: string[]): void {
  switch (op.kind) {
    case "nest":
      nestEntry(doc, op.source, op.target);
      return;
    case "merge":
      mergeMenu(doc, op.source, op.target);
      return;
    case "extractOnto":
      extractOnto(doc, op.parent, op.child, op.target);
      return;
    case "extractToTop":
      extractToTop(doc, op.parent, op.child);
      return;
    case "reorderMenu": {
      // Match the drag preview's arrayMove semantics: the dragged child
      // takes over's slot.
      const order = displayedChildren ?? [];
      const from = order.indexOf(op.child);
      const to = order.indexOf(op.over);
      if (from < 0 || to < 0 || from === to) return;
      reorderMenu(doc, op.parent, arrayMove(order, from, to));
      return;
    }
  }
}
