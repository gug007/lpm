import YAML from "yaml";
import { ACTION_SECTIONS } from "./actionConfig";
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
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (YAML.isMap(node) && node.has(key)) {
      return { section, map: node, value: node.get(key, true) };
    }
  }
  return null;
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

// Move a top-level source entry into target's nested actions: map.
// Used for leaf->leaf (target widens to split menu) and leaf->menu.
export function nestEntry(doc: Doc, sourceKey: string, targetKey: string): void {
  const source = findTopEntry(doc, sourceKey);
  const target = findTopEntry(doc, targetKey);
  if (!source || !target) return;
  const sourceNode = source.map.get(sourceKey, true);
  source.map.delete(sourceKey);
  const targetMap = asMap(doc, target.map, targetKey);
  const children = childActionsMap(doc, targetMap);
  children.set(sourceKey, sourceNode);
}

// Spread a source menu into target: its default (if any) becomes a regular
// child, its existing children move up as equal items, source is removed.
export function mergeMenu(doc: Doc, sourceKey: string, targetKey: string): void {
  const source = findTopEntry(doc, sourceKey);
  const target = findTopEntry(doc, targetKey);
  if (!source || !target) return;

  const sourceNode = source.map.get(sourceKey, true);
  const targetMap = asMap(doc, target.map, targetKey);
  const dest = childActionsMap(doc, targetMap);

  if (YAML.isMap(sourceNode)) {
    const childMap = sourceNode.get("actions", true);
    sourceNode.delete("actions");
    const hasDefault =
      sourceNode.has("cmd") &&
      typeof (sourceNode.get("cmd", true) as YAML.Scalar)?.value === "string";
    if (hasDefault) dest.set(sourceKey, sourceNode);
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
      parent.map.delete(parentKey);
      parent.map.set(only.key.value as string, only.value);
    }
  }
}

export function extractToTop(doc: Doc, parentKey: string, childKey: string): void {
  const node = detachChild(doc, parentKey, childKey);
  if (node === null) return;
  const section = findTopEntry(doc, parentKey)?.section ?? ACTION_SECTIONS[0];
  const sectionMap = ensureSection(doc, section);
  sectionMap.set(childKey, node);
  collapseMenu(doc, parentKey);
}

// Move a menu child directly onto another top-level item, then collapse
// the source parent. Re-homes the node at top level first so nestEntry can
// treat it uniformly with a leaf drag.
export function extractOnto(
  doc: Doc,
  parentKey: string,
  childKey: string,
  targetKey: string,
): void {
  const node = detachChild(doc, parentKey, childKey);
  if (node === null) return;
  const section = findTopEntry(doc, parentKey)?.section ?? ACTION_SECTIONS[0];
  ensureSection(doc, section).set(childKey, node);
  nestEntry(doc, childKey, targetKey);
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

function currentChildOrder(doc: Doc, parentKey: string): string[] {
  const parent = findTopEntry(doc, parentKey);
  if (!parent || !YAML.isMap(parent.value)) return [];
  const children = parent.value.get("actions", true);
  if (!YAML.isMap(children)) return [];
  return children.items
    .filter((i) => YAML.isScalar(i.key))
    .map((i) => String((i.key as YAML.Scalar).value));
}

export function applyOpToDoc(doc: Doc, op: StructuralOp): void {
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
      const order = currentChildOrder(doc, op.parent).filter((k) => k !== op.child);
      const at = order.indexOf(op.over);
      order.splice(at < 0 ? order.length : at, 0, op.child);
      reorderMenu(doc, op.parent, order);
      return;
    }
  }
}
