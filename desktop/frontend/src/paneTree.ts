export type SplitDirection = "row" | "col";

// Sentinel stored in `PaneLeaf.activeServiceName` when the primary pane is
// displaying every service side-by-side. Reserved — a service with this
// literal name collides.
export const ALL_SERVICES = "__lpm_all__";

export interface TerminalInstance {
  id: string;
  label: string;
  // Stable per-terminal identity for message-history scoping. Unlike `id` (a
  // live PTY id regenerated on every restart), this is persisted, so a terminal
  // keeps its own "This terminal" history across restarts without bleeding into
  // other terminals that merely share a label. Absent on non-terminal
  // (browser/review) tabs.
  historyKey?: string;
  startCmd?: string;
  resumeCmd?: string;
  actionName?: string;
  pinned?: boolean;
  // Custom emoji shown as the tab icon (in place of the terminal icon).
  // Inherited from the action that launched the terminal.
  emoji?: string;
  // Absent == terminal; "browser" tabs render an in-pane web browser, "review"
  // tabs render the git diff review pane. Neither has a PTY.
  kind?: "terminal" | "browser" | "review";
}

// True for real PTY-backed terminal tabs (the default kind). Browser and review
// tabs have no terminal, so they skip PTY status handling and persistence.
export function isTerminalTab(t: TerminalInstance): boolean {
  return t.kind === undefined || t.kind === "terminal";
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
  opts?: {
    startCmd?: string;
    resumeCmd?: string;
    actionName?: string;
    pinned?: boolean;
    emoji?: string;
    historyKey?: string;
  },
): TerminalInstance {
  return {
    id,
    label,
    historyKey: opts?.historyKey ?? crypto.randomUUID(),
    ...(opts?.startCmd ? { startCmd: opts.startCmd } : {}),
    ...(opts?.resumeCmd ? { resumeCmd: opts.resumeCmd } : {}),
    ...(opts?.actionName ? { actionName: opts.actionName } : {}),
    ...(opts?.pinned ? { pinned: true } : {}),
    ...(opts?.emoji ? { emoji: opts.emoji } : {}),
  };
}

export function makeBrowser(id: string, label = "Browser"): TerminalInstance {
  return { id, label, kind: "browser" };
}

export function makeReview(id: string, label = "Review"): TerminalInstance {
  return { id, label, kind: "review" };
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

/**
 * Single source of truth for "is this tab pinned?". All close paths
 * (× icon, Cmd+W hotkey, closeTerminal guard) consult this helper so
 * they cannot drift apart.
 */
export function isTabPinned(pane: PaneLeaf, idx: number): boolean {
  return pane.tabs[idx]?.pinned === true;
}

export function clampIdx(idx: number | undefined, length: number): number {
  if (typeof idx !== "number" || length === 0) return 0;
  return Math.max(0, Math.min(idx, length - 1));
}

// A selectable entry in a pane's header strip: either a service log (the
// "All" aggregate is a service named ALL_SERVICES) or a terminal/browser/
// review tab.
export type PaneHeaderItem =
  | { kind: "service"; name: string }
  | { kind: "tab"; idx: number };

// The header entries in the left-to-right order PaneView renders them: the
// "All" aggregate (only with more than one service), then each service, then
// each tab.
export function paneHeaderItems(pane: PaneLeaf, serviceNames: string[]): PaneHeaderItem[] {
  const items: PaneHeaderItem[] = [];
  if (serviceNames.length > 1) items.push({ kind: "service", name: ALL_SERVICES });
  for (const name of serviceNames) items.push({ kind: "service", name });
  pane.tabs.forEach((_, idx) => items.push({ kind: "tab", idx }));
  return items;
}

// Index of the active header entry within `items`: the active service when it
// is still selectable (services absent from `items` — a stale name, or All
// with a single service — fall through), otherwise the active tab. -1 when
// nothing is selectable.
function activeHeaderIndex(items: PaneHeaderItem[], pane: PaneLeaf): number {
  if (pane.activeServiceName) {
    const i = items.findIndex((it) => it.kind === "service" && it.name === pane.activeServiceName);
    if (i >= 0) return i;
  }
  if (pane.tabs.length === 0) return -1;
  const idx = clampIdx(pane.activeTabIdx, pane.tabs.length);
  return items.findIndex((it) => it.kind === "tab" && it.idx === idx);
}

// The header entry `delta` steps from the active one, wrapping around both
// ends. Null when fewer than two entries are selectable.
export function adjacentPaneHeaderItem(
  pane: PaneLeaf,
  serviceNames: string[],
  delta: number,
): PaneHeaderItem | null {
  const items = paneHeaderItems(pane, serviceNames);
  if (items.length < 2) return null;
  const from = activeHeaderIndex(items, pane);
  const base = from < 0 ? 0 : from;
  return items[(base + delta + items.length) % items.length];
}
