import { collectPanes, findTerminalLocation, mapPane, type PaneNode, type TerminalInstance } from "./paneTree";

/** Tabs that close together: one tab, or every tab of a pane. */
export interface ClosingGroup {
  key: string;
  ids: string[];
  pane: boolean;
}

/** `tree` with the tabs in `ids` set to close once their agents are done. */
export function markCloseWhenDone(tree: PaneNode, ids: ReadonlySet<string>, how: "tab" | "pane"): PaneNode {
  let next = tree;
  for (const pane of collectPanes(tree)) {
    if (!pane.tabs.some((t) => ids.has(t.id))) continue;
    next = mapPane(next, pane.id, (p) => ({
      ...p,
      tabs: p.tabs.map((t) => (ids.has(t.id) ? { ...t, closeWhenDone: how } : t)),
    }));
  }
  return next;
}

export function withoutCloseWhenDone(tab: TerminalInstance): TerminalInstance {
  if (!tab.closeWhenDone) return tab;
  const { closeWhenDone: _, ...rest } = tab;
  return rest;
}

/** `tree` with the tab staying open, and the rest of its pane where the pane
 *  was to close with it. */
export function markKeptOpen(tree: PaneNode, id: string): PaneNode {
  const at = findTerminalLocation(tree, id);
  if (!at) return tree;
  return mapPane(tree, at.paneId, (p) => {
    const withPane = p.tabs[at.tabIdx].closeWhenDone === "pane";
    if (!p.tabs[at.tabIdx].closeWhenDone) return p;
    return {
      ...p,
      tabs: p.tabs.map((t) =>
        t.id === id || (withPane && t.closeWhenDone === "pane") ? withoutCloseWhenDone(t) : t,
      ),
    };
  });
}

const waitsWithPane = (t: TerminalInstance) => t.closeWhenDone === "pane";

export function closingGroups(tree: PaneNode | null): ClosingGroup[] {
  if (!tree) return [];
  return collectPanes(tree).flatMap((pane): ClosingGroup[] => {
    if (pane.tabs.length > 0 && pane.tabs.every(waitsWithPane)) {
      return [{ key: `pane:${pane.id}`, ids: pane.tabs.map((t) => t.id), pane: true }];
    }
    return pane.tabs
      .filter((t) => t.closeWhenDone === "tab" && !t.pinned)
      .map((t) => ({ key: t.id, ids: [t.id], pane: false }));
  });
}

/** `tree` once a pane that was to close whole no longer can, a tab of it having
 *  moved, been replaced or kept, or a new one opened in it: its tabs in `waited`
 *  go on waiting by themselves, and the rest stay. The same tree when every
 *  waiting pane is whole. */
export function settlePaneWaits(tree: PaneNode, waited: (id: string) => boolean): PaneNode {
  let next = tree;
  for (const pane of collectPanes(tree)) {
    if (!pane.tabs.some(waitsWithPane) || pane.tabs.every(waitsWithPane)) continue;
    next = mapPane(next, pane.id, (p) => ({
      ...p,
      tabs: p.tabs.map((t) =>
        !waitsWithPane(t) ? t : waited(t.id) ? { ...t, closeWhenDone: "tab" as const } : withoutCloseWhenDone(t),
      ),
    }));
  }
  return next;
}
