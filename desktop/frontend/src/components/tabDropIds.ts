import { PANE_EDGES, type PaneEdge } from "../paneMoves";

// Tab strip drop targets use the pane id with this suffix so the drag
// handler can distinguish "dropped on a specific tab" from "dropped on
// the empty part of a tab strip" (needed for panes that have no tabs of
// their own, e.g. service-only panes).
const STRIP_SUFFIX = ":tabstrip";
const EDGE_MARK = ":edge:";

export const tabStripDropId = (paneId: string) => `${paneId}${STRIP_SUFFIX}`;
export const isStripDropId = (id: string) => id.endsWith(STRIP_SUFFIX);
export const stripDropPaneId = (id: string) => id.slice(0, -STRIP_SUFFIX.length);

export const edgeDropId = (paneId: string, edge: PaneEdge) => `${paneId}${EDGE_MARK}${edge}`;
export const isEdgeDropId = (id: string) => id.includes(EDGE_MARK);

export function parseEdgeDropId(id: string): { paneId: string; edge: PaneEdge } | null {
  const at = id.lastIndexOf(EDGE_MARK);
  if (at < 0) return null;
  const edge = PANE_EDGES.find((e) => e === id.slice(at + EDGE_MARK.length));
  return edge ? { paneId: id.slice(0, at), edge } : null;
}

// The corner a tab is dropped on to keep it in a mini view (MiniViewDropZone).
export const MINI_VIEW_DROP_ID = "mini-view:corner";
