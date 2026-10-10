import { type HostTerminal } from "../../peer/hostTerminals";
import {
  type PaneNode,
  findPane,
  firstPaneId,
  makePaneLeaf,
  makeTerminal,
  mapPane,
} from "../../paneTree";
import { disambiguateLabel, pickTerminalLabel } from "../../terminalLabels";
import { nextId } from "./util";

// Appends the host's terminals behind the tab in view, so one opening on the
// host never pulls focus from what's being typed into here. Into an empty
// project they open as its first pane.
export function withHostTabs(
  tree: PaneNode | null,
  focusedPaneId: string | null,
  terminals: HostTerminal[],
): { tree: PaneNode; focus?: string } {
  const paneId = !tree
    ? nextId("pane")
    : focusedPaneId && findPane(tree, focusedPaneId)
      ? focusedPaneId
      : firstPaneId(tree);
  let next: PaneNode = tree ?? makePaneLeaf(paneId, []);
  for (const t of terminals) {
    const label = t.label ? disambiguateLabel(next, t.label) : pickTerminalLabel(next);
    const tab = makeTerminal(t.id, label, { pinned: t.pinned, emoji: t.emoji });
    next = mapPane(next, paneId, (p) => ({ ...p, tabs: [...p.tabs, tab] }));
  }
  return tree ? { tree: next } : { tree: next, focus: paneId };
}
