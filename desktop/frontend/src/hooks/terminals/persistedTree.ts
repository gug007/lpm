import { StartTerminal, StartTerminalForRestore } from "../../../bridge/commands";
import {
  type PersistedPaneNode,
  type PersistedTerminalEntry,
} from "../../terminals";
import {
  type PaneNode,
  makePaneLeaf,
  makeTerminal,
  clampIdx,
  isTerminalTab,
} from "../../paneTree";
import { nextId } from "./util";

/**
 * Walks a persisted tree and launches a fresh PTY for each terminal in
 * every leaf pane. Tabs within a pane are started in parallel; split
 * subtrees (`a` and `b`) are also reified in parallel. On any failure
 * partway through, the caller is responsible for stopping PTYs launched
 * so far via `startedIds`.
 */
export async function reifyTreeWithFreshPtys(
  node: PersistedPaneNode,
  projectName: string,
  startedIds: string[],
): Promise<PaneNode | null> {
  if (node.kind === "leaf") {
    const persistedTabs = node.tabs ?? [];
    // A service-only pane (no interactive terminals, just an active service
    // tab) is allowed. A truly empty pane is dropped.
    if (persistedTabs.length === 0 && !node.activeServiceName) return null;
    try {
      const ids = await Promise.all(
        persistedTabs.map((t) =>
          t.actionName
            ? StartTerminalForRestore(projectName, t.actionName)
            : StartTerminal(projectName),
        ),
      );
      ids.forEach((id) => startedIds.push(id));
      const tabs = ids.map((id, i) =>
        makeTerminal(id, persistedTabs[i].label ?? "Terminal", {
          historyKey: persistedTabs[i].historyKey,
          startCmd: persistedTabs[i].startCmd,
          resumeCmd: persistedTabs[i].resumeCmd,
          actionName: persistedTabs[i].actionName,
          pinned: persistedTabs[i].pinned,
          emoji: persistedTabs[i].emoji,
          color: persistedTabs[i].color,
        }),
      );
      const pane = makePaneLeaf(nextId("pane"), tabs, clampIdx(node.activeTabIdx, tabs.length));
      if (node.activeServiceName) pane.activeServiceName = node.activeServiceName;
      return pane;
    } catch {
      return null;
    }
  }
  if (!node.a || !node.b) return null;
  const [a, b] = await Promise.all([
    reifyTreeWithFreshPtys(node.a, projectName, startedIds),
    reifyTreeWithFreshPtys(node.b, projectName, startedIds),
  ]);
  if (!a || !b) return null;
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
