import { useCallback, type RefObject } from "react";
import { StartTerminal, StartTerminalForConfig } from "../../../bridge/commands";
import { IS_MIRROR_WINDOW } from "../../mirror";
import {
  collectTerminals,
  firstPaneId,
  makePaneLeaf,
  makeTerminal,
  clampIdx,
  terminalDisplayLabel,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { mergeOpenTabs, prepareLayout, type SavedLayoutNode, type SavedLayoutTab } from "../../savedLayouts";
import { configLaunchCmds, nextId } from "./util";

interface UseApplyLayoutProps {
  projectName: string;
  treeRef: RefObject<PaneNode | null>;
  restoreSettled: RefObject<Promise<void>>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
  forward: (kind: string, ...args: unknown[]) => void;
  scheduleCmdInject: (id: string, cmd: string) => void;
}

interface Launched {
  tab: TerminalInstance;
  cmd?: string;
}

// An action starts through its own config, which mints a new session the way a
// click on it does; an agent starts as its bare CLI; anything else is a shell.
async function launchTab(projectName: string, tab: SavedLayoutTab): Promise<Launched> {
  const look = { emoji: tab.emoji, color: tab.color };
  if (tab.actionName) {
    const started = await StartTerminalForConfig(projectName, tab.actionName, undefined, {
      label: tab.label,
      ...look,
      actionName: tab.actionName,
    });
    return {
      tab: makeTerminal(started.id, tab.label, {
        ...configLaunchCmds(started),
        actionName: tab.actionName,
        ...look,
      }),
      cmd: started.startCmd || undefined,
    };
  }
  const id: string = await StartTerminal(projectName);
  return { tab: makeTerminal(id, tab.label, look), cmd: tab.agent };
}

// A tab that won't start is left out rather than failing the whole layout.
async function buildTree(
  node: SavedLayoutNode,
  projectName: string,
  launched: Launched[],
): Promise<PaneNode> {
  if (node.kind === "split") {
    const [a, b] = await Promise.all([
      buildTree(node.a, projectName, launched),
      buildTree(node.b, projectName, launched),
    ]);
    return { kind: "split", direction: node.direction, ratio: node.ratio, a, b };
  }
  const results = await Promise.allSettled(node.tabs.map((tab) => launchTab(projectName, tab)));
  const tabs: TerminalInstance[] = [];
  results.forEach((r) => {
    if (r.status !== "fulfilled") return;
    launched.push(r.value);
    tabs.push(r.value.tab);
  });
  return makePaneLeaf(nextId("pane"), tabs, clampIdx(node.activeTabIdx, tabs.length));
}

/** Opens a saved layout: its panes and tabs, started fresh. Whatever is open
 *  already moves into the layout's first pane, so nothing is closed. */
export function useApplyLayout({
  projectName,
  treeRef,
  restoreSettled,
  applyTree,
  forward,
  scheduleCmdInject,
}: UseApplyLayoutProps) {
  return useCallback(
    async (root: SavedLayoutNode) => {
      if (IS_MIRROR_WINDOW) return forward("applyLayout", root);
      await restoreSettled.current;
      const before = treeRef.current;
      const openTabs = before ? collectTerminals(before) : [];
      const prepared = prepareLayout(
        root,
        openTabs.map(terminalDisplayLabel),
        before !== null,
      );
      const launched: Launched[] = [];
      const built = await buildTree(prepared, projectName, launched);
      if (launched.length === 0) return;
      const next = mergeOpenTabs(treeRef.current, built);
      applyTree(next, firstPaneId(next));
      launched.forEach(({ tab, cmd }) => {
        if (cmd) scheduleCmdInject(tab.id, cmd);
      });
    },
    [projectName, treeRef, restoreSettled, applyTree, forward, scheduleCmdInject],
  );
}
