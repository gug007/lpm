import type { RefObject } from "react";
import { StopTerminal } from "../../../bridge/commands";
import { disposeInteractivePaneSession } from "../../components/InteractivePane";
import {
  findPane,
  findTerminalLocation,
  isTerminalTab,
  type PaneNode,
  type TerminalInstance,
} from "../../paneTree";
import { swapTerminal } from "./swapTerminal";

interface TabTree {
  treeRef: RefObject<PaneNode | null>;
  applyTree: (next: PaneNode | null, focus?: string | null) => void;
}

// The terminal tab running `id`, and the pane it's in.
export function terminalTabOf(
  tree: PaneNode | null,
  id: string,
): { paneId: string; tab: TerminalInstance } | null {
  const at = tree ? findTerminalLocation(tree, id) : null;
  const tab = tree && at ? findPane(tree, at.paneId)?.tabs[at.tabIdx] : undefined;
  return at && tab && isTerminalTab(tab) ? { paneId: at.paneId, tab } : null;
}

// Puts the terminal `start` opens in the tab running `oldId`, which stays the
// same tab to the user. Null when the tab closed while it started; a failed
// start rejects.
export async function replaceTabTerminal(
  { treeRef, applyTree }: TabTree,
  oldId: string,
  start: () => Promise<string>,
): Promise<string | null> {
  const newId = await start();
  const at = terminalTabOf(treeRef.current, oldId);
  if (!at || !treeRef.current) {
    StopTerminal(newId).catch(() => {});
    return null;
  }
  applyTree(swapTerminal(treeRef.current, at.paneId, oldId, newId));
  // The pane still mounted on oldId must unmount before its session goes.
  setTimeout(() => disposeInteractivePaneSession(oldId), 0);
  return newId;
}
