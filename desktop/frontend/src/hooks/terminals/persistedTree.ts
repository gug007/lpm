import { StartTerminal, StartTerminalForRestore } from "../../../bridge/commands";
import {
  type PersistedPaneNode,
  type PersistedTab,
  type PersistedTerminalEntry,
} from "../../terminals";
import {
  type PaneNode,
  type TerminalInstance,
  makePaneLeaf,
  makeTerminal,
  clampIdx,
  isTerminalTab,
} from "../../paneTree";
import { nextId } from "./util";

/**
 * Walks a persisted tree and launches a fresh PTY for each terminal in
 * every leaf pane. Tabs within a pane are started in parallel; split
 * subtrees (`a` and `b`) are also reified in parallel.
 *
 * Tolerant of partial failure: a tab whose PTY won't start is dropped into
 * `dropped` and the rest of the tree still comes back, and a split whose side
 * came back empty collapses to its sibling. Losing every tab because one
 * action was renamed or one SSH host is unreachable would strand whole
 * sessions. Returns null only when nothing at all could be restored; the
 * caller stops the PTYs launched so far via `startedIds`.
 */
export async function reifyTreeWithFreshPtys(
  node: PersistedPaneNode,
  projectName: string,
  startedIds: string[],
  dropped: PersistedTab[] = [],
): Promise<PaneNode | null> {
  if (node.kind === "leaf") {
    const persistedTabs = node.tabs ?? [];
    // A service-only pane (no interactive terminals, just an active service
    // tab) is allowed. A truly empty pane is dropped.
    if (persistedTabs.length === 0 && !node.activeServiceName) return null;
    const results = await Promise.allSettled(
      persistedTabs.map((t) =>
        t.actionName
          ? StartTerminalForRestore(projectName, t.actionName)
          : StartTerminal(projectName),
      ),
    );
    const tabs: TerminalInstance[] = [];
    // Persisted index -> index in the surviving tabs, so the active tab stays
    // selected when an earlier tab dropped out.
    const newIdx: number[] = [];
    results.forEach((result, i) => {
      const t = persistedTabs[i];
      if (result.status !== "fulfilled") {
        newIdx.push(-1);
        dropped.push(t);
        return;
      }
      startedIds.push(result.value);
      newIdx.push(tabs.length);
      tabs.push(
        makeTerminal(result.value, t.label ?? "Terminal", {
          historyKey: t.historyKey,
          startCmd: t.startCmd,
          resumeCmd: t.resumeCmd,
          actionName: t.actionName,
          pinned: t.pinned,
          emoji: t.emoji,
          color: t.color,
        }),
      );
    });
    if (tabs.length === 0 && !node.activeServiceName) return null;
    const savedActive = newIdx[clampIdx(node.activeTabIdx, persistedTabs.length)] ?? -1;
    const activeTabIdx =
      savedActive >= 0 ? savedActive : clampIdx(node.activeTabIdx, tabs.length);
    const pane = makePaneLeaf(nextId("pane"), tabs, activeTabIdx);
    if (node.activeServiceName) pane.activeServiceName = node.activeServiceName;
    return pane;
  }
  if (!node.a || !node.b) return null;
  const [a, b] = await Promise.all([
    reifyTreeWithFreshPtys(node.a, projectName, startedIds, dropped),
    reifyTreeWithFreshPtys(node.b, projectName, startedIds, dropped),
  ]);
  if (!a || !b) return a ?? b;
  return {
    kind: "split",
    direction: node.direction === "col" ? "col" : "row",
    ratio: typeof node.ratio === "number" ? node.ratio : 0.5,
    a,
    b,
  };
}

/**
 * Strips live PTY ids before persisting — ids won't be valid after a
 * restart, so we zero them. label/startCmd/resumeCmd are kept so restore
 * can re-inject them.
 */
export function treeToPersisted(node: PaneNode): PersistedPaneNode {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      activeTabIdx: node.activeTabIdx,
      ...(node.activeServiceName ? { activeServiceName: node.activeServiceName } : {}),
      // Only terminal tabs persist; non-PTY tabs (browser webviews, review
      // diffs) are ephemeral and don't survive restart.
      tabs: node.tabs
        .filter(isTerminalTab)
        .map((t) => ({
          label: t.label,
          ...(t.historyKey ? { historyKey: t.historyKey } : {}),
          ...(t.startCmd ? { startCmd: t.startCmd } : {}),
          ...(t.resumeCmd ? { resumeCmd: t.resumeCmd } : {}),
          ...(t.actionName ? { actionName: t.actionName } : {}),
          ...(t.pinned ? { pinned: true } : {}),
          ...(t.emoji ? { emoji: t.emoji } : {}),
          ...(t.color ? { color: t.color } : {}),
        })),
    };
  }
  return {
    kind: "split",
    direction: node.direction,
    ratio: node.ratio,
    a: treeToPersisted(node.a),
    b: treeToPersisted(node.b),
  };
}

export function legacyEntriesToTree(entries: PersistedTerminalEntry[] | undefined): PersistedPaneNode | null {
  if (!entries || entries.length === 0) return null;
  return {
    kind: "leaf",
    activeTabIdx: 0,
    tabs: entries.map((e) => ({
      label: e.label,
      ...(e.startCmd ? { startCmd: e.startCmd } : {}),
      ...(e.resumeCmd ? { resumeCmd: e.resumeCmd } : {}),
    })),
  };
}
