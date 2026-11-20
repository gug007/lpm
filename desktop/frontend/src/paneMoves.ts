import {
  collectPanes,
  findPane,
  makePaneLeaf,
  mapPane,
  removePane,
  splitAtPane,
  type PaneLeaf,
  type PaneNode,
  type TerminalInstance,
} from "./paneTree";
import { resolveActiveAfterClose } from "./hooks/terminals/util";

export const PANE_EDGES = ["left", "right", "bottom"] as const;
export type PaneEdge = (typeof PANE_EDGES)[number];

// The pane `delta` steps from `paneId` in reading order (left to right, top to
// bottom), wrapping at both ends. Null when there is no other pane.
export function adjacentPaneId(tree: PaneNode, paneId: string, delta: 1 | -1): string | null {
  const panes = collectPanes(tree);
  if (panes.length < 2) return null;
  const at = panes.findIndex((p) => p.id === paneId);
  const from = at < 0 ? 0 : at;
  return panes[(from + delta + panes.length) % panes.length].id;
}

// A pane closes once its last tab leaves, unless it is showing a service.
function emptiedBy(pane: PaneLeaf, remaining: number): boolean {
  return remaining === 0 && !pane.activeServiceName;
}

// Whether one of this pane's tabs can move into a new pane beside it.
export function canSplitOffTab(pane: PaneLeaf): boolean {
  return !emptiedBy(pane, pane.tabs.length - 1);
}

// Takes a tab out of its pane, closing the pane when that empties it.
export function detachTab(
  tree: PaneNode,
  fromPaneId: string,
  termId: string,
): { tree: PaneNode | null; term: TerminalInstance } | null {
  const from = findPane(tree, fromPaneId);
  const idx = from ? from.tabs.findIndex((t) => t.id === termId) : -1;
  if (!from || idx < 0) return null;
  const remaining = from.tabs.filter((_, i) => i !== idx);
  const next = mapPane(tree, fromPaneId, (p) => ({
    ...p,
    tabs: remaining,
    activeTabIdx: resolveActiveAfterClose(p.activeTabIdx, idx, remaining.length),
  }));
  return { tree: emptiedBy(from, remaining.length) ? removePane(next, fromPaneId) : next, term: from.tabs[idx] };
}

// Moves a tab into a new pane on one side of `targetPaneId`. Null when nothing
// would change.
export function moveTabToNewPane(
  tree: PaneNode,
  fromPaneId: string,
  termId: string,
  targetPaneId: string,
  edge: PaneEdge,
  newPaneId: string,
): PaneNode | null {
  const from = findPane(tree, fromPaneId);
  if (!from || !findPane(tree, targetPaneId)) return null;
  if (fromPaneId === targetPaneId && !canSplitOffTab(from)) return null;
  const detached = detachTab(tree, fromPaneId, termId);
  if (!detached?.tree) return null;
  const leaf = makePaneLeaf(newPaneId, [detached.term], 0);
  return splitAtPane(detached.tree, targetPaneId, edge === "bottom" ? "col" : "row", leaf, edge === "left");
}
