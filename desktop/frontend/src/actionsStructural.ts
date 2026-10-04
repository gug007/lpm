import YAML from "yaml";
import { arrayMove } from "@dnd-kit/sortable";
import { ACTION_SECTIONS, findActionSection, hasActionBody } from "./actionConfig";
import type { StructuralOp } from "./actionsGesture";

// What a single doc can't tell: menus merge their children across config files.
export interface StructuralContext {
  // A menu's children in the order they show, as leaf keys.
  orderOf: (path: string) => string[];
}

const NO_CONTEXT: StructuralContext = { orderOf: () => [] };

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

// Where a button sat in its bar means nothing inside a menu.
const PLACEMENT_KEYS = ["position", "display", "layer"];

// Removes a top-level entry that only places a button declared in another
// file (position, display and layer alone). Returns whether one was removed.
export function dropPlacementNote(doc: Doc, key: string): boolean {
  for (const section of ACTION_SECTIONS) {
    const node = doc.get(section, true);
    if (!YAML.isMap(node)) continue;
    const entry = node.get(key, true);
    if (!YAML.isMap(entry)) continue;
    const placementOnly = entry.items.every(
      (item) => YAML.isScalar(item.key) && PLACEMENT_KEYS.includes(String(item.key.value)),
    );
    if (!placementOnly) return false;
    node.delete(key);
    return true;
  }
  return false;
}

// What an item takes from the items above it: the nearest cwd, port conflict
// and type, and the env merged from the top down. A `terminals:` entry is a
// terminal unless it names a type.
interface Inherited {
  cwd?: string;
  portConflict?: string;
  type?: string;
  env: Record<string, string>;
}

const INHERITED_FIELDS = ["cwd", "portConflict", "type"] as const;

// Read from this doc alone: what other config files add must never be copied
// into it (a private env var into a committed .lpm.yml, say).
function inheritedAt(doc: Doc, path: string): Inherited {
  const segs = path.split(":");
  const found: Inherited = { env: {} };
  if (findTopEntry(doc, segs[0])?.section === "terminals") found.type = "terminal";
  for (let i = 1; i <= segs.length; i++) {
    const node = findEntryByPath(doc, segs.slice(0, i).join(":"))?.value;
    if (!YAML.isMap(node)) continue;
    for (const field of INHERITED_FIELDS) {
      const value = node.get(field);
      if (typeof value === "string" && value !== "") found[field] = value;
    }
    const env = node.get("env", true);
    if (YAML.isMap(env)) Object.assign(found.env, env.toJSON());
  }
  return found;
}

// A moved item would quietly take what its new place hands down, so what it
// had and would lose is written onto the item itself. Nothing can say "the
// project root" or "the inline runner", so losing those can't be undone here.
function keepInherited(doc: Doc, container: MapNode, key: string, had: Inherited, gets: Inherited): void {
  const fields = INHERITED_FIELDS.filter((field) => had[field] && had[field] !== gets[field]);
  const env = Object.entries(had.env).filter(([name, value]) => gets.env[name] !== value);
  if (fields.length === 0 && env.length === 0) return;
  const map = asMap(doc, container, key);
  for (const field of fields) if (!map.has(field)) map.set(field, had[field]);
  if (env.length === 0) return;
  let own = map.get("env", true);
  if (!YAML.isMap(own)) {
    map.set("env", doc.createNode({}));
    own = map.get("env", true);
  }
  if (!YAML.isMap(own)) return;
  for (const [name, value] of env) if (!own.has(name)) own.set(name, value);
}

// What a top-level entry in `section` gets without naming anything.
function topLevelDefaults(section: string): Inherited {
  return section === "terminals" ? { type: "terminal", env: {} } : { env: {} };
}

// Move a source entry (at any path depth) into target's nested actions: map,
// at its end, the way the drop showed it.
export function nestEntry(doc: Doc, sourcePath: string, targetPath: string, context = NO_CONTEXT): void {
  if (sourcePath === targetPath) return;
  const source = findEntryByPath(doc, sourcePath);
  const target = findEntryByPath(doc, targetPath);
  if (!source || !target) return;
  // A note that only places a button declared elsewhere: children grafted
  // onto it would hide the menu that file gives the button.
  if (!hasActionBody(target.value)) throw notHere();
  const leaf = source.key;
  if (peekChildrenOf(target.value)?.has(leaf)) throw conflictError(leaf);
  const had = inheritedAt(doc, sourcePath);
  const gets = inheritedAt(doc, targetPath);
  const node = source.parent.get(source.key, true);
  source.parent.delete(source.key);
  if (YAML.isMap(node)) for (const key of PLACEMENT_KEYS) node.delete(key);
  const targetMap = asMap(doc, target.parent, target.key);
  const children = childActionsMap(doc, targetMap);
  children.set(leaf, node);
  keepInherited(doc, children, leaf, had, gets);
  const shown = context.orderOf(targetPath);
  const order = (shown.length > 0 ? shown : childKeyOrder(children)).filter((key) => key !== leaf);
  reorderMenu(doc, targetPath, [...order, leaf]);
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
  const had = inheritedAt(doc, parentPath);
  const node = detachChild(doc, parentPath, childKey);
  if (node === null) throw notHere();
  const section = findEntryByPath(doc, parentPath)?.section ?? ACTION_SECTIONS[0];
  const sectionMap = ensureSection(doc, section);
  sectionMap.set(childKey, node);
  keepInherited(doc, sectionMap, childKey, had, topLevelDefaults(section));
  collapseMenu(doc, parentPath);
}

// The item isn't in the file the menu's level points at: its menu takes items
// from another config file, which this edit can't reach.
function notHere(): Error {
  return new Error("this menu's items come from another config file");
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
  context = NO_CONTEXT,
): void {
  const target = findEntryByPath(doc, targetPath);
  if (!target || !hasActionBody(target.value)) throw notHere();
  if (peekChildrenOf(target.value)?.has(childKey)) throw conflictError(childKey);
  const had = inheritedAt(doc, parentPath);
  const gets = inheritedAt(doc, targetPath);
  const node = detachChild(doc, parentPath, childKey);
  if (node === null) throw notHere();
  const targetMap = asMap(doc, target.parent, target.key);
  const targetChildren = childActionsMap(doc, targetMap);
  targetChildren.set(childKey, node);
  keepInherited(doc, targetChildren, childKey, had, gets);
  // In the order the menu shows, which can differ from its keys' order here.
  const shown = context.orderOf(targetPath);
  const order = [...(shown.length > 0 ? shown : childKeyOrder(targetChildren)).filter((key) => key !== childKey), childKey];
  const next = over && position ? positionedOrder(order, childKey, over, position) : order;
  reorderMenu(doc, targetPath, next ?? order);
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

export function applyOpToDoc(doc: Doc, op: StructuralOp, context = NO_CONTEXT): void {
  switch (op.kind) {
    case "nest":
      nestEntry(doc, op.source, op.target, context);
      return;
    case "ungroup":
      ungroupMenu(doc, op.path);
      return;
    case "extractOnto":
      extractOnto(doc, op.parent, op.child, op.target, op.over, op.position, context);
      return;
    case "extractToTop":
      extractToTop(doc, op.parent, op.child);
      return;
    case "reorderMenu": {
      const order = context.orderOf(op.parent);
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
