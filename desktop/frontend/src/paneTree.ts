export type SplitDirection = "row" | "col";

// Sentinel stored in `PaneLeaf.activeServiceName` when the primary pane is
// displaying every service side-by-side. Reserved — a service with this
// literal name collides.
export const ALL_SERVICES = "__lpm_all__";

export interface TerminalInstance {
  id: string;
  label: string;
  startCmd?: string;
  resumeCmd?: string;
  actionName?: string;
  // Stable id used as the tmux session name for persistent shells; absent
  // for non-persistent terminals.
  persistentId?: string;
}

export interface PaneLeaf {
  kind: "leaf";
  id: string;
  tabs: TerminalInstance[];
  activeTabIdx: number;
  // When set (and the service still exists), the pane displays this
  // service's log instead of the interactive terminal at activeTabIdx.
  // Services are only actually rendered on the first leaf of the tree;
  // other leaves ignore this field.
  activeServiceName?: string;
}

export interface PaneSplit {
  kind: "split";
  direction: SplitDirection;
  ratio: number;
  a: PaneNode;
  b: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export function makePaneLeaf(id: string, tabs: TerminalInstance[], activeTabIdx = 0): PaneLeaf {
  return { kind: "leaf", id, tabs, activeTabIdx };
}

export function makeTerminal(
  id: string,
  label: string,
  opts?: { startCmd?: string; resumeCmd?: string; actionName?: string; persistentId?: string },
): TerminalInstance {
  return {
    id,
    label,
    ...(opts?.startCmd ? { startCmd: opts.startCmd } : {}),
    ...(opts?.resumeCmd ? { resumeCmd: opts.resumeCmd } : {}),
    ...(opts?.actionName ? { actionName: opts.actionName } : {}),
    ...(opts?.persistentId ? { persistentId: opts.persistentId } : {}),
  };
}

export function walkPanes(node: PaneNode, fn: (pane: PaneLeaf) => void): void {
  if (node.kind === "leaf") { fn(node); return; }
  walkPanes(node.a, fn);
  walkPanes(node.b, fn);
}

export function collectPanes(node: PaneNode): PaneLeaf[] {
  const out: PaneLeaf[] = [];
  walkPanes(node, (p) => out.push(p));
  return out;
}

export function collectTerminals(node: PaneNode): TerminalInstance[] {
  const out: TerminalInstance[] = [];
  walkPanes(node, (p) => out.push(...p.tabs));
  return out;
}

export function findPane(node: PaneNode, paneId: string): PaneLeaf | null {
  if (node.kind === "leaf") return node.id === paneId ? node : null;
  return findPane(node.a, paneId) ?? findPane(node.b, paneId);
}

export function firstPaneId(node: PaneNode): string {
  return node.kind === "leaf" ? node.id : firstPaneId(node.a);
}

export function lastPaneId(node: PaneNode): string {
  return node.kind === "leaf" ? node.id : lastPaneId(node.b);
}

/**
 * Navigation path from the tree root to the leaf with `paneId`. Each step
 * is 0 (take `a`) or 1 (take `b`). Returns `[]` when the root itself is the
 * target leaf, or `null` if the pane isn't in the tree. Paths stay valid
 * across restore even though pane ids get regenerated.
 */
export function panePath(node: PaneNode, paneId: string): number[] | null {
  const out: number[] = [];
  return buildPanePath(node, paneId, out) ? (out.reverse(), out) : null;
}

function buildPanePath(node: PaneNode, paneId: string, out: number[]): boolean {
  if (node.kind === "leaf") return node.id === paneId;
  if (buildPanePath(node.a, paneId, out)) { out.push(0); return true; }
  if (buildPanePath(node.b, paneId, out)) { out.push(1); return true; }
  return false;
}

/**
 * Walk a navigation path to the leaf it points at. Returns null if the
 * path doesn't resolve to a leaf (tree shape changed, bad index, etc.).
 */
export function paneAtPath(node: PaneNode, path: number[]): PaneLeaf | null {
  let current: PaneNode = node;
  for (const step of path) {
    if (current.kind !== "split") return null;
    const child = step === 0 ? current.a : step === 1 ? current.b : null;
    if (!child) return null;
    current = child;
  }
  return current.kind === "leaf" ? current : null;
}

/** Id of the leaf visually adjacent to `paneId`, or null if it has no sibling. */
export function siblingPaneId(node: PaneNode, paneId: string): string | null {
  if (node.kind === "leaf") return null;
  if (node.a.kind === "leaf" && node.a.id === paneId) return firstPaneId(node.b);
  if (node.b.kind === "leaf" && node.b.id === paneId) return lastPaneId(node.a);
  return siblingPaneId(node.a, paneId) ?? siblingPaneId(node.b, paneId);
}

export function mapPane(node: PaneNode, paneId: string, fn: (p: PaneLeaf) => PaneLeaf): PaneNode {
  if (node.kind === "leaf") return node.id === paneId ? fn(node) : node;
  const a = mapPane(node.a, paneId, fn);
  const b = mapPane(node.b, paneId, fn);
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

export function replacePane(node: PaneNode, paneId: string, replacement: PaneNode): PaneNode {
  if (node.kind === "leaf") return node.id === paneId ? replacement : node;
  const a = replacePane(node.a, paneId, replacement);
  const b = replacePane(node.b, paneId, replacement);
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

/**
 * Remove a pane from the tree. Returns the new root, or null if the removed
 * pane was the only one. When removing one side of a split, the sibling
 * takes the split's place (the split node is collapsed).
 */
export function removePane(node: PaneNode, paneId: string): PaneNode | null {
  if (node.kind === "leaf") return node.id === paneId ? null : node;
  if (node.a.kind === "leaf" && node.a.id === paneId) return node.b;
  if (node.b.kind === "leaf" && node.b.id === paneId) return node.a;
  const a = removePane(node.a, paneId);
  if (a === null) return node.b;
  const b = removePane(node.b, paneId);
  if (b === null) return node.a;
  if (a === node.a && b === node.b) return node;
  return { ...node, a, b };
}

export function setRatioAtPath(node: PaneNode, path: number[], ratio: number): PaneNode {
  if (path.length === 0) {
    if (node.kind !== "split") return node;
    const clamped = Math.max(0.05, Math.min(0.95, ratio));
    return clamped === node.ratio ? node : { ...node, ratio: clamped };
  }
  if (node.kind !== "split") return node;
  const [head, ...rest] = path;
  if (head === 0) {
    const a = setRatioAtPath(node.a, rest, ratio);
    return a === node.a ? node : { ...node, a };
  }
  const b = setRatioAtPath(node.b, rest, ratio);
  return b === node.b ? node : { ...node, b };
}

/**
 * Split a pane: the original pane becomes child `a`, a new pane (with the
 * given terminal list) becomes child `b`. Returns the new root tree.
 */
export function splitAtPane(
  node: PaneNode,
  paneId: string,
  direction: SplitDirection,
  newPane: PaneLeaf,
): PaneNode {
  const existing = findPane(node, paneId);
  if (!existing) return node;
  return replacePane(node, paneId, {
    kind: "split",
    direction,
    ratio: 0.5,
    a: existing,
    b: newPane,
  });
}
